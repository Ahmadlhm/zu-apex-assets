-- Run in REGIST and TECH_REGIST after the registration module exists.
-- Creates read-only summary and registered daily endpoints; leaves students/ intact.
BEGIN
  ORDS.DEFINE_TEMPLATE(p_module_name => 'zu.registration.dashboard', p_pattern => 'summary/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'zu.registration.dashboard', p_pattern => 'summary/',
    p_method => 'GET', p_source_type => ORDS.source_type_collection_feed,
    p_items_per_page => 5000,
    p_source => q'~
      WITH registered_terms AS (
        SELECT m.STUDENTID, m.YEAR, m.TERM,
               MIN(m.REGIST_DATE) AS FIRST_REGIST_DATE,
               MIN(CASE WHEN m.COURSEID IS NOT NULL AND level_course.COURSEID IS NULL
                        THEN m.REGIST_DATE END) AS FIRST_ACADEMIC_DATE,
               MAX(CASE WHEN m.COURSEID IS NOT NULL AND level_course.COURSEID IS NULL
                        THEN 1 ELSE 0 END) AS HAS_ACADEMIC_COURSE
        FROM MARKSANDREG m
        LEFT JOIN (SELECT DISTINCT COURSEID FROM COURSES WHERE COURSETYPE IN (18, 19, 20)) level_course
          ON level_course.COURSEID = m.COURSEID
        WHERE m.YEAR BETWEEN NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)
                       AND NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))
          AND m.TERM IN (1, 2, 3)
        GROUP BY m.STUDENTID, m.YEAR, m.TERM
      ), facts AS (
        SELECT p.STUDENTID, p.FACULTYID, p.MAJOR,
               TO_NUMBER(p.ADMNYEAR) AS YEAR, TO_NUMBER(p.ADMNSEM) AS TERM,
               'admitted' AS KIND, 'new' AS STUDENT_GROUP
        FROM STUDENTPRIMARY p
        JOIN registered_terms ar ON ar.STUDENTID = p.STUDENTID
          AND ar.YEAR = p.ADMNYEAR AND ar.TERM = p.ADMNSEM
          AND ar.HAS_ACADEMIC_COURSE = 1
        WHERE p.ADMNYEAR BETWEEN NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)
                            AND NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))
          AND p.ADMNSEM IN (1, 2, 3)
        UNION ALL
        SELECT r.STUDENTID, p.FACULTYID, p.MAJOR,
               TO_NUMBER(r.YEAR), TO_NUMBER(r.TERM), 'registered',
               CASE WHEN p.ADMNYEAR = r.YEAR AND p.ADMNSEM = r.TERM
                         AND r.HAS_ACADEMIC_COURSE = 1
                    THEN 'new' ELSE 'continuing' END
        FROM registered_terms r
        LEFT JOIN STUDENTPRIMARY p ON p.STUDENTID = r.STUDENTID
      ), grouped AS (
        SELECT YEAR, KIND,
               CASE WHEN GROUPING(TERM) = 1 THEN 0 ELSE TERM END AS SCOPE_TERM,
               CASE WHEN GROUPING(FACULTYID) = 1 THEN NULL ELSE FACULTYID END AS FACULTY_ID,
               CASE WHEN GROUPING(MAJOR) = 1 THEN NULL ELSE MAJOR END AS DEPARTMENT_ID,
               CASE WHEN GROUPING(STUDENT_GROUP) = 1 THEN 'all' ELSE STUDENT_GROUP END AS STUDENT_GROUP,
               GROUPING(STUDENT_GROUP) AS GROUP_ROLLUP,
               COUNT(DISTINCT STUDENTID) AS TOTAL
        FROM facts
        GROUP BY YEAR, KIND, CUBE(TERM, FACULTYID, MAJOR, STUDENT_GROUP)
      )
      SELECT YEAR, SCOPE_TERM, TRIM(CAST(FACULTY_ID AS VARCHAR2(40))) AS FACULTY_ID,
             TRIM(CAST(DEPARTMENT_ID AS VARCHAR2(40))) AS DEPARTMENT_ID,
             KIND, STUDENT_GROUP, TOTAL
      FROM grouped
      WHERE KIND = 'registered' OR GROUP_ROLLUP = 1
      ORDER BY YEAR, KIND, SCOPE_TERM, FACULTY_ID, DEPARTMENT_ID, STUDENT_GROUP
    ~'
  );

  ORDS.DEFINE_TEMPLATE(p_module_name => 'zu.registration.dashboard', p_pattern => 'registration-days/');
  ORDS.DEFINE_HANDLER(
    p_module_name => 'zu.registration.dashboard', p_pattern => 'registration-days/',
    p_method => 'GET', p_source_type => ORDS.source_type_collection_feed,
    p_items_per_page => 1000,
    p_source => q'~
      WITH registered_terms AS (
        SELECT m.STUDENTID, m.YEAR, m.TERM,
               MIN(m.REGIST_DATE) AS FIRST_REGIST_DATE,
               MIN(CASE WHEN m.COURSEID IS NOT NULL AND level_course.COURSEID IS NULL
                        THEN m.REGIST_DATE END) AS FIRST_ACADEMIC_DATE,
               MAX(CASE WHEN m.COURSEID IS NOT NULL AND level_course.COURSEID IS NULL
                        THEN 1 ELSE 0 END) AS HAS_ACADEMIC_COURSE
        FROM MARKSANDREG m
        LEFT JOIN (SELECT DISTINCT COURSEID FROM COURSES WHERE COURSETYPE IN (18, 19, 20)) level_course
          ON level_course.COURSEID = m.COURSEID
        WHERE m.YEAR = NVL(:year, EXTRACT(YEAR FROM SYSDATE))
          AND m.TERM IN (1, 2, 3)
        GROUP BY m.STUDENTID, m.YEAR, m.TERM
      ), filtered AS (
        SELECT r.STUDENTID, TO_NUMBER(r.TERM) AS TERM,
               r.FIRST_REGIST_DATE, r.FIRST_ACADEMIC_DATE,
               CASE WHEN p.ADMNYEAR = r.YEAR AND p.ADMNSEM = r.TERM
                         AND r.HAS_ACADEMIC_COURSE = 1
                    THEN 'new' ELSE 'continuing' END AS STUDENT_GROUP
        FROM registered_terms r
        LEFT JOIN STUDENTPRIMARY p ON p.STUDENTID = r.STUDENTID
        WHERE (:faculty_id IS NULL OR TRIM(CAST(p.FACULTYID AS VARCHAR2(40))) = :faculty_id)
          AND (:department_id IS NULL OR TRIM(CAST(p.MAJOR AS VARCHAR2(40))) = :department_id)
      ), scoped AS (
        SELECT STUDENTID, 0 AS SCOPE_TERM,
               CASE WHEN :student_group = 'new' THEN FIRST_ACADEMIC_DATE
                    ELSE FIRST_REGIST_DATE END AS FIRST_REGIST_DATE
        FROM filtered
        WHERE :student_group IS NULL OR :student_group = 'all' OR STUDENT_GROUP = :student_group
        UNION ALL
        SELECT STUDENTID, TERM,
               CASE WHEN :student_group = 'new' THEN FIRST_ACADEMIC_DATE
                    ELSE FIRST_REGIST_DATE END AS FIRST_REGIST_DATE
        FROM filtered
        WHERE :student_group IS NULL OR :student_group = 'all' OR STUDENT_GROUP = :student_group
      ), first_dates AS (
        SELECT STUDENTID, SCOPE_TERM, MIN(FIRST_REGIST_DATE) AS FIRST_DATE
        FROM scoped GROUP BY STUDENTID, SCOPE_TERM
      )
      SELECT SCOPE_TERM, TO_CHAR(TRUNC(FIRST_DATE), 'YYYY-MM-DD') AS EVENT_DATE,
             COUNT(*) AS TOTAL
      FROM first_dates
      GROUP BY SCOPE_TERM, TRUNC(FIRST_DATE)
      ORDER BY SCOPE_TERM, EVENT_DATE
    ~'
  );
  COMMIT;
END;
/

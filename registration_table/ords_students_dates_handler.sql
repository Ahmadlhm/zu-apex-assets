-- Install in the university and technical-college registration schemas.
-- Replaces only GET students/ in the existing registration dashboard module.
-- The first dated course row supplies each student's registration date per term.
BEGIN
  ORDS.DEFINE_HANDLER(
    p_module_name    => 'zu.registration.dashboard',
    p_pattern        => 'students/',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_collection_feed,
    p_items_per_page => 1000,
    p_source         => q'~
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
        SELECT TRIM(CAST(p.STUDENTID AS VARCHAR2(40))) AS student_id,
               TRIM(CAST(p.FACULTYID AS VARCHAR2(40))) AS faculty_id,
               TRIM(CAST(p.MAJOR AS VARCHAR2(40))) AS department_id,
               TO_NUMBER(p.ADMNYEAR) AS year, TO_NUMBER(p.ADMNSEM) AS term,
               'admitted' AS kind, 'new' AS student_group,
               CAST(NULL AS VARCHAR2(10)) AS event_date,
               CAST(NULL AS VARCHAR2(10)) AS academic_date
        FROM STUDENTPRIMARY p
        JOIN registered_terms ar ON ar.STUDENTID = p.STUDENTID
          AND ar.YEAR = p.ADMNYEAR AND ar.TERM = p.ADMNSEM
          AND ar.HAS_ACADEMIC_COURSE = 1
        WHERE p.ADMNYEAR BETWEEN NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)
                            AND NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))
          AND p.ADMNSEM IN (1, 2, 3)
        UNION ALL
        SELECT TRIM(CAST(r.STUDENTID AS VARCHAR2(40))),
               TRIM(CAST(p.FACULTYID AS VARCHAR2(40))),
               TRIM(CAST(p.MAJOR AS VARCHAR2(40))),
               TO_NUMBER(r.YEAR), TO_NUMBER(r.TERM), 'registered',
               CASE WHEN p.ADMNYEAR = r.YEAR AND p.ADMNSEM = r.TERM
                         AND r.HAS_ACADEMIC_COURSE = 1
                    THEN 'new' ELSE 'continuing' END,
               TO_CHAR(TRUNC(r.FIRST_REGIST_DATE), 'YYYY-MM-DD'),
               TO_CHAR(TRUNC(r.FIRST_ACADEMIC_DATE), 'YYYY-MM-DD')
        FROM registered_terms r
        LEFT JOIN STUDENTPRIMARY p ON p.STUDENTID = r.STUDENTID
      )
      SELECT student_id, faculty_id, department_id, year, term, kind, student_group, event_date, academic_date
      FROM facts
      ORDER BY year, term, kind, student_id, faculty_id, department_id
    ~'
  );
  COMMIT;
END;
/

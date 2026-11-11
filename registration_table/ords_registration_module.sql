-- Run in the university registration schema, then separately in the technical-college schema.
-- Draft based on the supplied table metadata and TRANS_TYPES lookup. Not executed against Oracle by this project.
-- Accepted students require an academic course in their admission term; registered students require any MARKSANDREG row.
-- COURSETYPE 18, 19, 20 identifies Arabic, computer, and English placement tests.
-- MARKSTATUS describes course mark entry/outcome; CONFIRMED_ is not used as a student eligibility filter.
-- Actual names in screenshots: FACULTIES and MARKSANDREG.
-- The API exposes identifiers and aggregates only; no student names or individual marks.
DECLARE
  PROCEDURE define_get(p_path VARCHAR2, p_query CLOB) IS
  BEGIN
    ORDS.DEFINE_TEMPLATE(p_module_name => 'zu.registration.dashboard', p_pattern => p_path);
    ORDS.DEFINE_HANDLER(
      p_module_name => 'zu.registration.dashboard', p_pattern => p_path,
      p_method => 'GET', p_source_type => ORDS.source_type_collection_feed,
      p_items_per_page => 1000, p_source => p_query
    );
  END;
BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name => 'zu.registration.dashboard',
    p_base_path => '/registration-dashboard/', p_items_per_page => 1000,
    p_status => 'PUBLISHED', p_comments => 'Registration dashboard - install separately in each institution schema'
  );

  define_get('faculties/', q'~
    SELECT TRIM(CAST(CODE AS VARCHAR2(40))) AS id, FACULTY AS name
    FROM FACULTIES ORDER BY CODE
  ~');

  define_get('departments/', q'~
    SELECT TRIM(CAST(DEPARTMENTID AS VARCHAR2(40))) AS id,
           DEPARTMENTNAME AS name,
           TRIM(CAST(FACULTYID AS VARCHAR2(40))) AS faculty_id
    FROM DEPARTMENTS ORDER BY FACULTYID, DEPARTMENTID
  ~');

  define_get('students/', q'~
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
        -- MARKSTATUS 10 means marks not entered; filtering it would remove current students.
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
  ~');

  define_get('admissions-history/', q'~
    SELECT TO_CHAR(TO_DATE(TRIM(CAST(REG_DATE AS VARCHAR2(20))), 'YYYYMMDD'), 'YYYY-MM-DD') AS event_date,
           TO_NUMBER(YEAR) AS year, TO_NUMBER(TERM) AS term, SUM(COUNT) AS total
    FROM ST_ADMIN_TB
    WHERE YEAR BETWEEN NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)
                   AND NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))
      AND REG_DATE IS NOT NULL AND TERM IN (1, 2, 3)
    GROUP BY REG_DATE, YEAR, TERM
    ORDER BY YEAR, TERM, REG_DATE
  ~');
  -- Use this for the accepted-student timeline. The older admissions-history/
  -- remains available as the independent ST_ADMIN_TB administrative series.
  define_get('accepted-days/', q'~
    SELECT TO_CHAR(TRUNC(p.REG_ENTRY_DATE), 'YYYY-MM-DD') AS event_date,
           TO_NUMBER(p.ADMNYEAR) AS year,
           TO_NUMBER(p.ADMNSEM) AS term,
           COUNT(DISTINCT p.STUDENTID) AS total
    FROM STUDENTPRIMARY p
    WHERE p.ADMNYEAR BETWEEN NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)
                         AND NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))
      AND p.ADMNSEM IN (1, 2, 3)
    GROUP BY p.ADMNYEAR, p.ADMNSEM, TRUNC(p.REG_ENTRY_DATE)
    ORDER BY p.ADMNYEAR, p.ADMNSEM, TRUNC(p.REG_ENTRY_DATE)
  ~');
  -- TRANS_TYPES identifies code 5 as graduation. ENDING_YEAR/ENDING_TERM
  -- represent the academic period; DECISION_YEAR is the decision year.
  define_get('graduates/', q'~
    SELECT TRIM(CAST(t.STUDENTID AS VARCHAR2(40))) AS student_id,
           TRIM(CAST(p.FACULTYID AS VARCHAR2(40))) AS faculty_id,
           TRIM(CAST(p.MAJOR AS VARCHAR2(40))) AS department_id,
           TO_NUMBER(t.ENDING_YEAR) AS year, TO_NUMBER(t.ENDING_TERM) AS term,
           t.RANK AS rank, t.CUMMULATIVE_AVERAGE AS average
    FROM STUDENTS_TRANS t
    LEFT JOIN (
      SELECT STUDENTID, FACULTYID, MAJOR,
             ROW_NUMBER() OVER (
               PARTITION BY STUDENTID
               ORDER BY ADMNYEAR DESC, ADMNSEM DESC, ROWID DESC
             ) AS rn
      FROM STUDENTPRIMARY
    ) p ON p.STUDENTID = t.STUDENTID AND p.rn = 1
    WHERE t.TRANS_TYPE_CODE = 5
      AND t.ENDING_YEAR BETWEEN NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)
                            AND NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))
      AND t.ENDING_TERM IN (1, 2, 3)
    ORDER BY t.ENDING_YEAR, t.ENDING_TERM, t.STUDENTID
  ~');
  COMMIT;
END;
/

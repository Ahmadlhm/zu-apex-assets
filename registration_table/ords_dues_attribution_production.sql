-- Production release: replaces summary/, students/, registration-days/ and defines quality/ in the selected schema.
-- Run as one APEX SQL Script first in REGIST, then in TECH_REGIST.
-- DUES-based attribution for the registration dashboard. Run as one SQL
-- Script in REGIST, then TECH_REGIST.
-- Installs live endpoints. No student or fee rows change.
-- MARKSANDREG defines registration, dates, and the academic-course rule;
-- DUES defines faculty and department in that SAME year and semester.
-- Admission stays in STUDENTPRIMARY.ADMNYEAR/ADMNSEM and uses the DUES
-- location for that admission semester. Missing/incomplete DUES periods
-- stay in totals under DUES_REVIEW and appear in quality/.
-- DUES_PRIM_KEY (ST_NO, YEAR, SEMESTER) is present in both schemas.
DECLARE
  v_schema VARCHAR2(128) := SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA');
  v_table_count PLS_INTEGER;
  v_key_count PLS_INTEGER;
  v_sql CLOB;
  v_path VARCHAR2(100);
  v_facts_template CLOB := q'~
    WITH registered_terms AS (
      SELECT m.STUDENTID, m.YEAR, TO_NUMBER(m.TERM) AS TERM,
             MIN(m.REGIST_DATE) AS FIRST_REGIST_DATE,
             MIN(CASE WHEN m.COURSEID IS NOT NULL AND level_course.COURSEID IS NULL
                      THEN m.REGIST_DATE END) AS FIRST_ACADEMIC_DATE,
             MAX(CASE WHEN m.COURSEID IS NOT NULL AND level_course.COURSEID IS NULL
                      THEN 1 ELSE 0 END) AS HAS_ACADEMIC_COURSE
      FROM MARKSANDREG m
      LEFT JOIN (SELECT DISTINCT COURSEID FROM COURSES WHERE COURSETYPE IN (18, 19, 20)) level_course
        ON level_course.COURSEID = m.COURSEID
      WHERE m.YEAR BETWEEN __FROM_YEAR__ AND __TO_YEAR__
        AND m.TERM IN ('1', '2', '3')
      GROUP BY m.STUDENTID, m.YEAR, m.TERM
    ), located_terms AS (
      SELECT r.STUDENTID, r.YEAR, r.TERM, r.FIRST_REGIST_DATE,
             r.FIRST_ACADEMIC_DATE,
             CASE WHEN d.ST_NO IS NULL OR TRIM(d.FACULTY_CODE) IS NULL
                            OR TRIM(d.DEPARTMENT_CODE) IS NULL
                  THEN 'DUES_REVIEW' ELSE TRIM(d.FACULTY_CODE) END AS FACULTYID,
             CASE WHEN d.ST_NO IS NULL OR TRIM(d.FACULTY_CODE) IS NULL
                            OR TRIM(d.DEPARTMENT_CODE) IS NULL
                  THEN 'DUES_REVIEW' ELSE TRIM(d.DEPARTMENT_CODE) END AS MAJOR,
             CASE WHEN d.ST_NO IS NULL THEN 'missing_dues'
                  WHEN TRIM(d.FACULTY_CODE) IS NULL
                    OR TRIM(d.DEPARTMENT_CODE) IS NULL THEN 'incomplete_dues'
                  ELSE 'resolved' END AS ATTRIBUTION_STATUS,
             CASE WHEN TO_NUMBER(p.ADMNYEAR) = r.YEAR
                            AND TO_NUMBER(p.ADMNSEM) = r.TERM
                            AND r.HAS_ACADEMIC_COURSE = 1
                  THEN 'new' ELSE 'continuing' END AS STUDENT_GROUP
      FROM registered_terms r
      LEFT JOIN STUDENTPRIMARY p ON p.STUDENTID = r.STUDENTID
      LEFT JOIN DUES d ON d.ST_NO = r.STUDENTID
        AND d.YEAR = r.YEAR AND d.SEMESTER = r.TERM
    ), facts AS (
      SELECT l.STUDENTID, l.FACULTYID, l.MAJOR, l.YEAR, l.TERM, k.KIND,
             CASE WHEN k.KIND = 'admitted' THEN 'new' ELSE l.STUDENT_GROUP END AS STUDENT_GROUP,
             CASE WHEN k.KIND = 'admitted' THEN l.FIRST_ACADEMIC_DATE
                  ELSE l.FIRST_REGIST_DATE END AS EVENT_DATE,
             l.FIRST_ACADEMIC_DATE, l.ATTRIBUTION_STATUS
      FROM located_terms l
      CROSS JOIN (SELECT 'admitted' AS KIND FROM dual
                  UNION ALL SELECT 'registered' FROM dual) k
      WHERE k.KIND = 'registered' OR l.STUDENT_GROUP = 'new'
    )
  ~';
  FUNCTION facts_sql(p_from VARCHAR2, p_to VARCHAR2) RETURN CLOB IS
  BEGIN
    RETURN REPLACE(REPLACE(v_facts_template, '__FROM_YEAR__', p_from),
      '__TO_YEAR__', p_to);
  END;
  PROCEDURE define_get(p_name VARCHAR2, p_query CLOB, p_page_size PLS_INTEGER) IS
  BEGIN
    v_path := p_name || '/';
    ORDS.DEFINE_TEMPLATE(p_module_name => 'zu.registration.dashboard', p_pattern => v_path);
    ORDS.DEFINE_HANDLER(
      p_module_name => 'zu.registration.dashboard', p_pattern => v_path,
      p_method => 'GET', p_source_type => ORDS.source_type_collection_feed,
      p_items_per_page => p_page_size, p_source => p_query
    );
    DBMS_OUTPUT.PUT_LINE('Prepared ' || v_schema || ': ' || v_path);
  END;
BEGIN
  IF v_schema NOT IN ('REGIST', 'TECH_REGIST') THEN
    RAISE_APPLICATION_ERROR(-20001, 'Select REGIST or TECH_REGIST as the APEX parsing schema first.');
  END IF;
  SELECT COUNT(*) INTO v_table_count FROM ALL_TABLES
  WHERE OWNER = v_schema AND TABLE_NAME = 'DUES';
  IF v_table_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20010, 'Local DUES table is unavailable in ' || v_schema || '.');
  END IF;
  SELECT COUNT(*) INTO v_key_count FROM (
    SELECT c.CONSTRAINT_NAME
    FROM ALL_CONSTRAINTS k JOIN ALL_CONS_COLUMNS c
      ON c.OWNER = k.OWNER AND c.CONSTRAINT_NAME = k.CONSTRAINT_NAME
    WHERE k.OWNER = v_schema AND k.TABLE_NAME = 'DUES'
      AND k.CONSTRAINT_TYPE = 'P'
      AND c.COLUMN_NAME IN ('ST_NO', 'YEAR', 'SEMESTER')
    GROUP BY c.CONSTRAINT_NAME HAVING COUNT(*) = 3
  );
  IF v_key_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20011, 'DUES primary key must cover ST_NO, YEAR, SEMESTER.');
  END IF;
  DBMS_OUTPUT.PUT_LINE('DUES attribution revision: per-period-v2');

  v_sql := facts_sql('NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)',
                     'NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))');
  -- SCOPE_TERM=0 counts each person once per year and specialty. A person
  -- present in two specialties across semesters appears in both specialty
  -- rows, but once in the unfiltered university/year total.
  define_get('summary', v_sql || q'~
    , grouped AS (
      SELECT YEAR, KIND,
             CASE WHEN GROUPING(TERM) = 1 THEN 0 ELSE TERM END AS SCOPE_TERM,
             CASE WHEN GROUPING(FACULTYID) = 1 THEN NULL ELSE FACULTYID END AS FACULTY_ID,
             CASE WHEN GROUPING(MAJOR) = 1 THEN NULL ELSE MAJOR END AS DEPARTMENT_ID,
             CASE WHEN GROUPING(STUDENT_GROUP) = 1 THEN 'all' ELSE STUDENT_GROUP END AS STUDENT_GROUP,
             GROUPING(STUDENT_GROUP) AS GROUP_ROLLUP, COUNT(DISTINCT STUDENTID) AS TOTAL
      FROM facts GROUP BY YEAR, KIND, CUBE(TERM, FACULTYID, MAJOR, STUDENT_GROUP)
    )
    SELECT YEAR, SCOPE_TERM, FACULTY_ID, DEPARTMENT_ID, KIND, STUDENT_GROUP, TOTAL
    FROM grouped WHERE KIND = 'registered' OR GROUP_ROLLUP = 1
    ORDER BY YEAR, KIND, SCOPE_TERM, FACULTY_ID, DEPARTMENT_ID, STUDENT_GROUP
  ~', 5000);
  define_get('students', v_sql || q'~
    SELECT TRIM(CAST(STUDENTID AS VARCHAR2(40))) AS student_id,
           FACULTYID AS faculty_id, MAJOR AS department_id, YEAR, TERM, KIND, STUDENT_GROUP,
           TO_CHAR(TRUNC(EVENT_DATE), 'YYYY-MM-DD') AS event_date,
           TO_CHAR(TRUNC(FIRST_ACADEMIC_DATE), 'YYYY-MM-DD') AS academic_date,
           ATTRIBUTION_STATUS AS attribution_status
    FROM facts ORDER BY YEAR, TERM, KIND, STUDENTID, FACULTYID, MAJOR
  ~', 1000);

  v_sql := facts_sql('NVL(:year, EXTRACT(YEAR FROM SYSDATE))',
                     'NVL(:year, EXTRACT(YEAR FROM SYSDATE))');
  define_get('registration-days', v_sql || q'~
    , filtered AS (
      SELECT STUDENTID, TERM,
             CASE WHEN KIND = 'admitted' OR :student_group = 'new' THEN FIRST_ACADEMIC_DATE
                  ELSE EVENT_DATE END AS FIRST_DATE
      FROM facts
      WHERE KIND = NVL(:metric, 'registered')
        AND (:student_group IS NULL OR :student_group = 'all' OR STUDENT_GROUP = :student_group)
        AND (:faculty_id IS NULL OR FACULTYID = :faculty_id)
        AND (:department_id IS NULL OR MAJOR = :department_id)
    ), scoped AS (
      SELECT STUDENTID, 0 AS SCOPE_TERM, FIRST_DATE FROM filtered
      UNION ALL
      SELECT STUDENTID, TERM, FIRST_DATE FROM filtered
    ), first_dates AS (
      SELECT STUDENTID, SCOPE_TERM, MIN(FIRST_DATE) AS FIRST_DATE
      FROM scoped GROUP BY STUDENTID, SCOPE_TERM
    )
    SELECT SCOPE_TERM, TO_CHAR(TRUNC(FIRST_DATE), 'YYYY-MM-DD') AS EVENT_DATE, COUNT(*) AS TOTAL
    FROM first_dates GROUP BY SCOPE_TERM, TRUNC(FIRST_DATE) ORDER BY SCOPE_TERM, EVENT_DATE
  ~', 1000);

  v_sql := facts_sql('NVL(:from_year, EXTRACT(YEAR FROM SYSDATE) - 9)',
                     'NVL(:to_year, EXTRACT(YEAR FROM SYSDATE))');
  define_get('quality', v_sql || q'~
    SELECT 'registered_periods_missing_dues' AS ISSUE, COUNT(*) AS TOTAL FROM facts
    WHERE KIND = 'registered' AND ATTRIBUTION_STATUS = 'missing_dues'
    UNION ALL
    SELECT 'registered_periods_incomplete_dues', COUNT(*) FROM facts
    WHERE KIND = 'registered' AND ATTRIBUTION_STATUS = 'incomplete_dues'
    UNION ALL
    SELECT 'admitted_people_needing_review', COUNT(DISTINCT STUDENTID) FROM facts
    WHERE KIND = 'admitted' AND ATTRIBUTION_STATUS <> 'resolved'
    UNION ALL
    SELECT 'registered_people_needing_review', COUNT(DISTINCT STUDENTID) FROM facts
    WHERE KIND = 'registered' AND ATTRIBUTION_STATUS <> 'resolved'
  ~', 1000);
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/

-- Install in each registration schema after the registration dashboard module exists.
-- Read-only GET endpoint; graduation is TRANS_TYPES code 5.
BEGIN
  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'zu.registration.dashboard',
    p_pattern     => 'graduates/'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name    => 'zu.registration.dashboard',
    p_pattern        => 'graduates/',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_collection_feed,
    p_items_per_page => 1000,
    p_source         => q'~
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
    ~'
  );

  COMMIT;
END;
/

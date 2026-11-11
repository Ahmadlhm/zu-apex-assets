-- Run in the ZU_GATES schema after the zug.dashboard module exists.
-- One consistent database read returns one day's successful gate facts.
-- The compact fixed-position arrays avoid ORDS 1,000-row pagination overhead.
-- Contract: [trans_id, employee_id, employee_name, tr_time, direction,
--            gender, suffix, emp_position, center, dept_name, zone_name].
BEGIN
  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'zug.dashboard',
    p_pattern     => 'transactions-day/',
    p_comments    => 'Complete single-day gate facts in compact JSON'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name   => 'zug.dashboard',
    p_pattern       => 'transactions-day/',
    p_method        => 'GET',
    p_source_type   => ORDS.source_type_media,
    p_source        => q'~
      SELECT 'application/json' AS mime_type,
             NVL(
               JSON_ARRAYAGG(
                 JSON_ARRAY(
                   t.TRANS_ID,
                   CAST(t.EMPLOYEE_ID AS VARCHAR2(40)),
                   t.EMPLOYEE_NAME,
                   t.TR_TIME,
                   t.TRANS_DIRECTION,
                   t.EMPLOYEE_GENDER,
                   t.SUFFIX,
                   t.EMP_POSITION,
                   t.CENTER,
                   t.DEPT_NAME,
                   t.ZONE_NAME
                   NULL ON NULL
                 )
                 ORDER BY t.TR_TIME DESC, t.TRANS_ID DESC
                 RETURNING CLOB
               ),
               TO_CLOB('[]')
             ) AS content
      FROM TRANSACTIONS t
      WHERE t.TR_DATE = TO_NUMBER(REPLACE(:day, '-', ''))
        AND t.EVENT_ID = 1
        AND t.TRANS_DIRECTION IN ('IN', 'OUT')
    ~',
    p_comments      => 'GET ?day=YYYY-MM-DD; single JSON array response'
  );

  COMMIT;
END;
/

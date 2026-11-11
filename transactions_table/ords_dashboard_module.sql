-- شغّل هذا الملف داخل SQL Workshop > SQL Commands باستخدام Schema: ZU_GATES
-- ينشئ REST Module خاصاً بلوحة حركة البوابات.

BEGIN
  ORDS.DEFINE_MODULE(
    p_module_name    => 'zug.dashboard',
    p_base_path      => '/gates-dashboard/',
    p_items_per_page => 1000,
    p_status         => 'PUBLISHED',
    p_comments       => 'Zarqa University gates dashboard API'
  );

  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'zug.dashboard',
    p_pattern     => 'transactions/',
    p_comments    => 'Successful gate transactions in a date range'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name    => 'zug.dashboard',
    p_pattern        => 'transactions/',
    p_method         => 'GET',
    p_source_type    => ORDS.SOURCE_TYPE_QUERY,
    p_items_per_page => 1000,
    p_mimes_allowed  => 'application/json',
    p_source         => q'~
      SELECT
        t.TRANS_ID,
        t.EMPLOYEE_ID,
        t.EMPLOYEE_NAME,
        t.TR_DATE,
        t.TR_TIME,
        t.TRANS_DIRECTION,
        t.EMPLOYEE_GENDER,
        t.SUFFIX,
        t.EMP_POSITION,
        t.CENTER,
        t.DEPT_NAME,
        t.ZONE_NAME,
        t.EVENT_ID
      FROM TRANSACTIONS t
      WHERE t.EVENT_ID = 1
        AND t.TR_DATE >= NVL(
          TO_NUMBER(REPLACE(:from_date, '-', '')),
          TO_NUMBER(TO_CHAR(SYSDATE, 'YYYYMMDD'))
        )
        AND t.TR_DATE <= NVL(
          TO_NUMBER(REPLACE(:to_date, '-', '')),
          TO_NUMBER(TO_CHAR(SYSDATE, 'YYYYMMDD'))
        )
        AND t.TRANS_DIRECTION IN ('IN', 'OUT')
      ORDER BY t.TR_DATE DESC, t.TR_TIME DESC, t.TRANS_ID DESC
    ~'
  );

  COMMIT;
END;
/

-- رابط الاختبار بعد استبدال اسم خادم ORDS:
-- https://SERVER/ords/zu_gates/gates-dashboard/transactions/?from_date=2026-09-28&to_date=2026-09-28

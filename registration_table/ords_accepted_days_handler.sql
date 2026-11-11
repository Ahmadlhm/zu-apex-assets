-- Install in REGIST and TECH_REGIST after zu.registration.dashboard exists.
-- GET accepted-days/ groups the same STUDENTPRIMARY population as summary/.
-- A null event_date is retained so the UI can disclose undated older records.
BEGIN
  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'zu.registration.dashboard',
    p_pattern     => 'accepted-days/'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name    => 'zu.registration.dashboard',
    p_pattern        => 'accepted-days/',
    p_method         => 'GET',
    p_source_type    => ORDS.source_type_collection_feed,
    p_items_per_page => 1000,
    p_source         => q'~
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
    ~'
  );

  COMMIT;
END;
/

-- Install in ZU_GATES after the zug.dashboard module exists.
-- A bounded lookback avoids counting people whose last recorded IN was months ago.
-- The client supplies the agreed maximum stay in hours; the dashboard uses 24.
-- At midnight, only security staff can carry a previous-day IN into the next day.
-- A same-day IN is eligible for every category.
-- The client sends the preceding minute for an exclusive selected end time.
-- The default 23:59 retains its full-day meaning.
-- Contract: [trans_id, employee_id, tr_date, tr_time, gender, suffix,
--            emp_position, center, dept_name, zone_name]. Only latest-IN people are returned.
BEGIN
  ORDS.DEFINE_TEMPLATE(
    p_module_name => 'zug.dashboard',
    p_pattern     => 'presence-snapshot/',
    p_comments    => 'Last successful gate direction per person within a bounded window'
  );

  ORDS.DEFINE_HANDLER(
    p_module_name   => 'zug.dashboard',
    p_pattern       => 'presence-snapshot/',
    p_method        => 'GET',
    p_source_type   => ORDS.source_type_media,
    p_source        => q'~
      WITH bounds AS (
        SELECT TO_DATE(:at_date || ' ' || :at_time || ':59', 'YYYY-MM-DD HH24:MI:SS') AS at_ts,
               LEAST(72, GREATEST(1, NVL(TO_NUMBER(:lookback_hours), 24))) AS hours_back
        FROM dual
      ), limits AS (
        SELECT TO_NUMBER(TO_CHAR(at_ts, 'YYYYMMDD')) AS at_day,
               TO_NUMBER(TO_CHAR(at_ts, 'HH24MISS')) AS at_clock,
               TO_NUMBER(TO_CHAR(at_ts - hours_back / 24, 'YYYYMMDD')) AS from_day,
               TO_NUMBER(TO_CHAR(at_ts - hours_back / 24, 'HH24MISS')) AS from_clock
        FROM bounds
      ), ranked AS (
        SELECT t.TRANS_ID, t.EMPLOYEE_ID, t.TR_DATE, t.TR_TIME,
               t.TRANS_DIRECTION, t.EMPLOYEE_GENDER, t.SUFFIX,
               t.EMP_POSITION, t.CENTER, t.DEPT_NAME, t.ZONE_NAME,
               ROW_NUMBER() OVER (
                 PARTITION BY t.EMPLOYEE_ID
                 ORDER BY t.TR_DATE DESC, t.TR_TIME DESC, t.TRANS_ID DESC
               ) AS rn
        FROM TRANSACTIONS t CROSS JOIN limits b
        WHERE t.EMPLOYEE_ID IS NOT NULL
          AND t.EVENT_ID = 1
          AND t.TRANS_DIRECTION IN ('IN', 'OUT')
          AND t.TR_DATE BETWEEN b.from_day AND b.at_day
          AND (t.TR_DATE > b.from_day OR t.TR_TIME >= b.from_clock)
          AND (t.TR_DATE < b.at_day OR t.TR_TIME <= b.at_clock)
      )
      SELECT 'application/json' AS mime_type,
             NVL(JSON_ARRAYAGG(
               JSON_ARRAY(
                 TRANS_ID, CAST(EMPLOYEE_ID AS VARCHAR2(40)), TR_DATE, TR_TIME,
                 EMPLOYEE_GENDER, SUFFIX, EMP_POSITION, CENTER, DEPT_NAME, ZONE_NAME
                 NULL ON NULL
               ) ORDER BY TR_DATE DESC, TR_TIME DESC, TRANS_ID DESC RETURNING CLOB
             ), TO_CLOB('[]')) AS content
      FROM ranked r CROSS JOIN limits b
      WHERE r.rn = 1
        AND r.TRANS_DIRECTION = 'IN'
        AND (
          r.TR_DATE = b.at_day
          OR (
            REPLACE(TRIM(r.EMP_POSITION), 'أ', 'ا') = 'امن وحماية'
            AND TRIM(r.DEPT_NAME) = 'شعبة الأمن والسلامة'
          )
        )
    ~',
    p_comments      => 'GET ?at_date=YYYY-MM-DD&at_time=HH:MI&lookback_hours=24'
  );

  COMMIT;
END;
/

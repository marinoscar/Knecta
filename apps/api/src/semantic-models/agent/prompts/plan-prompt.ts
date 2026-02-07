export const PLAN_PROMPT = `Based on the tables in scope, create a discovery plan. For each table, you will need to:
1. List columns (types, PKs, nullability)
2. Get sample data (3-5 rows)
3. Check for foreign keys

After individual table discovery:
4. Analyze cross-table relationships (explicit FKs + inferred)
5. Validate inferred relationships with queries
6. Generate metrics for numeric/categorical columns

Please output a structured plan describing what you'll do for each table and the expected number of tool calls.`;

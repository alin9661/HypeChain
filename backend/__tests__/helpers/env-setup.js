/**
 * Test env bootstrap — must be the FIRST import in any test file that
 * (transitively) imports services/payment.js, whose Supabase client is
 * created at module load. ESM hoists imports above inline statements, so
 * setting these inline in the test file runs too late.
 */
process.env.HACKNYU_SUPABASE_URL ||= 'http://localhost:54321';
process.env.HACKNYU_SUPABASE_SERVICE_ROLE_KEY ||= 'dummy-service-role-key';

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Check if admin already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const adminExists = existingUsers?.users?.some(u => u.email === 'ithubafrica2120@ithubafrica.com');
    
    if (adminExists) {
      const user = existingUsers?.users?.find(u => u.email === 'ithubafrica2120@ithubafrica.com');
      if (user) {
        await supabaseAdmin.from('user_roles').upsert({
          user_id: user.id,
          role: 'admin',
        }, { onConflict: 'user_id,role' });
      }
      return new Response(JSON.stringify({ message: 'Admin already exists, role ensured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin user
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: 'ithubafrica2120@ithubafrica.com',
      password: 'Kikelomo2120@',
      email_confirm: true,
      user_metadata: { full_name: 'IT Hub Africa Admin' },
    });

    if (error) throw error;

    // Assign admin role
    await supabaseAdmin.from('user_roles').insert({
      user_id: newUser.user.id,
      role: 'admin',
    });

    return new Response(JSON.stringify({ message: 'Admin created successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

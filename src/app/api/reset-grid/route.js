// src/app/api/reset-grid/route.js

import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

export async function POST(request) {
  try {
    const userId = request.headers.get('x-user-id') || 'guest';
    const today = new Date().toISOString().slice(0, 10);

    console.log(`🔄 [API] Resetting grid for user ${userId} on ${today}`);

    // 1) Delete all guesses for today for this user
    const { error: delGErr } = await supabase
      .from('guesses')
      .delete()
      .eq('user_id', userId)
      .eq('puzzle_date', today);
    if (delGErr) throw delGErr;

    // 2) Delete their result entry (if any)
    const { error: delRErr } = await supabase
      .from('results')
      .delete()
      .eq('user_id', userId)
      .eq('puzzle_date', today);
    if (delRErr) throw delRErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('🔥 /api/reset-grid error:', err);
    return NextResponse.json({ error: 'Could not reset grid' }, { status: 500 });
  }
}

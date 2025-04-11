// src/app/api/leaderboard/route.js

import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0,10);
    const { data, error } = await supabase
      .from('results')
      .select('username, total_score')
      .eq('puzzle_date', today)
      .order('total_score', { ascending: true })
      .limit(10);

    if (error) throw error;
    return NextResponse.json({ leaderboard: data });
  } catch (err) {
    console.error('🔥 /api/leaderboard error:', err);
    return NextResponse.json({ error: 'Could not fetch leaderboard' }, { status: 500 });
  }
}

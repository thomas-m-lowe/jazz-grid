import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { rowMusicians, columnMusicians } from '../../../config/musicians';

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;

function cleanName(name) {
  return name.replace(/–.*$/g, '').replace(/\(.*\)/g, '').trim().toLowerCase();
}

export async function POST(request) {
  try {
    // 1. Parse & validate
    const { row, col, rowMusician, columnMusician, guess, puzzleDate } =
      await request.json();
    const today = new Date().toISOString().slice(0, 10);
    if (
      [row, col, rowMusician, columnMusician, guess, puzzleDate].some(v => v == null) ||
      puzzleDate !== today
    ) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // 2. Identify user
    const userId = request.headers.get('x-user-id') || 'guest';
    const username = request.headers.get('x-username') || 'Guest';

    // 3. Prevent duplicate guess
    const { count: dupCount } = await supabase
      .from('guesses')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .eq('puzzle_date', puzzleDate)
      .eq('row_index', row)
      .eq('col_index', col);
    if (dupCount > 0) {
      return NextResponse.json(
        { correct: false, alreadyGuessed: true, error: 'Already guessed this cell' },
        { status: 400 }
      );
    }

    // 4. Discogs validation
    const headers = {
      'User-Agent': 'JazzGridPuzzle/1.0',
      Authorization: `Discogs token=${DISCOGS_TOKEN}`,
    };
    const searchUrl = new URL('https://api.discogs.com/database/search');
    searchUrl.searchParams.set('release_title', guess);
    searchUrl.searchParams.set('type', 'release');

    console.log("🔍 Discogs search URL:", searchUrl.toString());
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) throw new Error('Discogs search failed');
    const { results } = await searchRes.json();
    console.log("🔍 Discogs search returned titles:", results.map(r => r.title).slice(0, 5));

    if (!results.length) {
      return NextResponse.json({ correct: false, error: 'Album not found' });
    }

    // Try top 5 candidates
    let found = false, foundTitle = '', foundCover = '';
    const rowClean = cleanName(rowMusician), colClean = cleanName(columnMusician);

    for (let i = 0; i < Math.min(5, results.length); i++) {
      const { id, title } = results[i];
      console.log(`➡️ Trying candidate #${i+1}: ID ${id}, title "${title}"`);
      const relRes = await fetch(`https://api.discogs.com/releases/${id}`, { headers });
      if (!relRes.ok) {
        console.warn(`⚠️ Release fetch failed for ID ${id}`);
        continue;
      }
      const rel = await relRes.json();
      console.log("🎵 Release title:", rel.title);

      // Gather credits
      const credits = [];
      if (Array.isArray(rel.artists))      credits.push(...rel.artists.map(a => a.name));
      if (Array.isArray(rel.credits))      credits.push(...rel.credits.map(c => c.name));
      if (Array.isArray(rel.extraartists)) credits.push(...rel.extraartists.map(e => e.name));
      console.log("👥 Credits:", credits);

      const cleaned = credits.map(cleanName);
      if (cleaned.some(n => n.includes(rowClean)) && cleaned.some(n => n.includes(colClean))) {
        found = true;
        foundTitle = rel.title;
        foundCover = rel.cover_image || rel.thumb || "";
        break;
      }
    }

    if (!found) {
      return NextResponse.json({
        correct: false,
        error: 'Album does not feature both musicians'
      });
    }

    // 5. Insert guess & get id
    const { data: ins, error: insErr } = await supabase
      .from('guesses')
      .insert([{
        user_id:     userId,
        puzzle_date: puzzleDate,
        row_index:   row,
        col_index:   col,
        album:       foundTitle,
        rarity:      null,
        cover:       foundCover,
      }])
      .select('id');
    if (insErr || !ins || ins.length === 0) throw insErr || new Error('Insert failed');
    const insertedId = ins[0].id;

    // 6. Compute rarity
    const { count: albumCount } = await supabase
      .from('guesses')
      .select('*', { head: true, count: 'exact' })
      .eq('puzzle_date', puzzleDate)
      .eq('row_index', row)
      .eq('col_index', col)
      .eq('album', foundTitle);

    const { count: totalCount } = await supabase
      .from('guesses')
      .select('*', { head: true, count: 'exact' })
      .eq('puzzle_date', puzzleDate)
      .eq('row_index', row)
      .eq('col_index', col);

    const rarity = totalCount > 0
      ? Math.round((albumCount / totalCount) * 1000) / 10
      : 100;
    console.log(`🔢 Rarity for "${foundTitle}" at [${row},${col}]: ${albumCount}/${totalCount} = ${rarity}%`);

    // 7. Update inserted row with rarity
    const { error: updErr } = await supabase
      .from('guesses')
      .update({ rarity })
      .eq('id', insertedId);
    if (updErr) console.error('Error updating rarity:', updErr);

    // 8. Check completion & upsert results
    const { count: userCount } = await supabase
      .from('guesses')
      .select('*', { head: true, count: 'exact' })
      .eq('puzzle_date', puzzleDate)
      .eq('user_id', userId);

    if (userCount === 9) {
      const { data: sumData, error: sumErr } = await supabase
        .from('guesses')
        .select('sum(rarity)', { head: false })
        .eq('puzzle_date', puzzleDate)
        .eq('user_id', userId);
      if (sumErr) console.error('Error summing rarity:', sumErr);
      const totalScore = parseFloat(sumData[0].sum) || 0;
      console.log(`🏁 User ${userId} completed puzzle. Total score: ${totalScore}`);

      const { error: upsertErr } = await supabase
        .from('results')
        .upsert([{
          user_id, username,
          puzzle_date: puzzleDate,
          total_score: totalScore
        }], { onConflict: ['user_id','puzzle_date'] });
      if (upsertErr) console.error('Error upserting result:', upsertErr);
    }

    // 9. Return
    return NextResponse.json({
      correct: true,
      album:   foundTitle,
      rarity,
      cover:   foundCover
    });
  } catch (err) {
    console.error('🔥 /api/check-guess error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}






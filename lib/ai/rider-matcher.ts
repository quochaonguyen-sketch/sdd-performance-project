export function fold(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

export function findMatchingRiders<T extends { rider_code: string; full_name: string }>(
  question: string,
  riders: T[]
): T[] {
  const qFolded = fold(question);
  // Normalize punctuation and symbols to spaces so matching works with punctuation (e.g. "đỗ anh dũng?", "anh dũng...")
  const qNorm = qFolded.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const qClean = ` ${qNorm} `;

  // 1. Check for numeric codes in question (e.g. 132420)
  const codeMatches = question.match(/\b\d{5,7}\b/g) || [];
  const codeSet = new Set(codeMatches);

  const matched: Array<{ rider: T; score: number }> = [];

  for (const r of riders) {
    if (codeSet.has(r.rider_code)) {
      matched.push({ rider: r, score: 100 });
      continue;
    }
    const nameFolded = fold(r.full_name);
    if (!nameFolded) continue;
    const nameNorm = nameFolded.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    // Full name match (either raw folded or normalized)
    if (qFolded.includes(nameFolded) || qClean.includes(` ${nameNorm} `)) {
      matched.push({ rider: r, score: 90 });
      continue;
    }

    const words = nameNorm.split(/\s+/);

    // Last 3 words if available
    if (words.length >= 3) {
      const last3 = `${words[words.length - 3]} ${words[words.length - 2]} ${words[words.length - 1]}`;
      if (qClean.includes(` ${last3} `)) {
        matched.push({ rider: r, score: 85 });
        continue;
      }
    }

    // Last 2 words (e.g. "anh dung", "hai tram", "thanh son", "tuan kiet")
    if (words.length >= 2) {
      const last2 = `${words[words.length - 2]} ${words[words.length - 1]}`;
      if (last2.length >= 4 && qClean.includes(` ${last2} `)) {
        matched.push({ rider: r, score: 80 });
        continue;
      }
    }
  }

  return matched
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => m.rider);
}

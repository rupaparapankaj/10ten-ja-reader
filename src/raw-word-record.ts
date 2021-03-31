import {
  Gloss,
  GlossType,
  GLOSS_TYPE_MAX,
  RawKanjiMeta,
  RawReadingMeta,
  RawWordSense,
} from '@birchill/hikibiki-data';
import { kanaToHiragana } from '@birchill/normal-jp';

import { stripFields } from './strip-fields';

type ExtendedSense = WordResult['s'][0];

// This type matches the structure of the records in the flat file database
// (which, incidentally, differ slightly from the data format used by
// hikibiki-data since, for example, they don't include the ID field).
//
// As a result it is only used as part of the fallback mechanism.

export interface RawWordRecord {
  k?: Array<string>;
  km?: Array<0 | RawKanjiMeta>;
  r: Array<string>;
  rm?: Array<0 | RawReadingMeta>;
  s: Array<RawWordSense>;
}

export function toWordResult({
  entry,
  matchingText,
  reason,
  romaji,
}: {
  entry: RawWordRecord;
  matchingText: string;
  reason?: string;
  romaji?: Array<string>;
}): WordResult {
  const kanjiMatch =
    !!entry.k && entry.k.some((k) => kanaToHiragana(k) === matchingText);
  const kanaMatch =
    !kanjiMatch && entry.r.some((r) => kanaToHiragana(r) === matchingText);

  return {
    k: mergeMeta(entry.k, entry.km, (key, meta) => ({
      ent: key,
      ...meta,
      match:
        (kanjiMatch && kanaToHiragana(key) === matchingText) || !kanjiMatch,
    })),
    r: mergeMeta(entry.r, entry.rm, (key, meta) => ({
      ent: key,
      ...meta,
      match: (kanaMatch && kanaToHiragana(key) === matchingText) || !kanaMatch,
    })),
    s: expandSenses(entry.s),
    reason,
    romaji,
  };
}

function mergeMeta<MetaType extends RawKanjiMeta | RawReadingMeta, MergedType>(
  keys: Array<string> | undefined,
  metaArray: Array<0 | MetaType> | undefined,
  merge: (key: string, meta?: MetaType) => MergedType
): Array<MergedType> {
  const result: Array<MergedType> = [];

  for (const [i, key] of (keys || []).entries()) {
    const meta: MetaType | undefined =
      metaArray && metaArray.length >= i + 1 && metaArray[i] !== 0
        ? (metaArray[i] as MetaType)
        : undefined;
    result.push(merge(key, meta));
  }

  return result;
}

function expandSenses(senses: Array<RawWordSense>): Array<ExtendedSense> {
  return senses.map((sense) => ({
    g: expandGlosses(sense),
    ...stripFields(sense, ['g', 'gt']),
    match: true,
  }));
}

const BITS_PER_GLOSS_TYPE = Math.floor(Math.log2(GLOSS_TYPE_MAX)) + 1;

function expandGlosses(sense: RawWordSense): Array<Gloss> {
  // Helpers to work out the gloss type
  const gt = sense.gt || 0;
  const typeMask = (1 << BITS_PER_GLOSS_TYPE) - 1;
  const glossTypeAtIndex = (i: number): GlossType => {
    return (gt >> (i * BITS_PER_GLOSS_TYPE)) & typeMask;
  };

  return sense.g.map((gloss, i) => {
    // This rather convoluted mess is because our test harness differentiates
    // between properties that are not set and those that are set to
    // undefined.
    const result: Gloss = { str: gloss };

    const type = glossTypeAtIndex(i);
    if (type !== GlossType.None) {
      result.type = type;
    }

    return result;
  });
}

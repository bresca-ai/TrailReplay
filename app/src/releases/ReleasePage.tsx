import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import changelog from '../../../CHANGELOG.md?raw';
import { parseReleaseNotes } from './releaseNotes';
import { releaseCopy, translateNote } from './releaseCopy';
import { useI18n } from '@/i18n/useI18n';
import { languageLabels, type LanguageCode } from '@/i18n/translations';
import { localizedHomePath, seoLocalizedPath } from '@/seo/seoLocale';

const releases = parseReleaseNotes(changelog);

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-[#eee8dd] px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

export function ReleasePage() {
  const [query, setQuery] = useState('');
  const { language, setLanguage } = useI18n();
  const copy = releaseCopy[language];
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return releases;
    return releases.filter((release) => {
      const translated = [release.version, release.date, ...release.introduction, ...release.sections.flatMap((section) => [section.title, ...section.items])].map((value) => translateNote(language, value)).join(" ");
      return translated.toLocaleLowerCase().includes(term) || JSON.stringify(release).toLocaleLowerCase().includes(term);
    });
  }, [query, language]);

  return <div className="min-h-screen bg-[#f7f4ed] text-[#1c3229]" style={{ fontFamily: "Inter, sans-serif" }}>
    <header className="border-b border-white/10 bg-[#1c3229] text-[#f7f4ed]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <a href={localizedHomePath(language)} className="inline-flex items-center gap-2 text-sm font-semibold hover:text-[#f2b384]"><ArrowLeft size={16} /> {copy.back}</a>
        <div className="flex items-center gap-4"><select aria-label={copy.language} value={language} onChange={(event) => { const next = event.target.value as LanguageCode; setLanguage(next); window.location.assign(`${seoLocalizedPath('/releases', next)}${window.location.hash}`); }} className="max-w-32 rounded-lg border border-white/20 bg-[#1c3229] px-2 py-2 text-xs text-white">{Object.entries(languageLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><a href={localizedHomePath(language)} aria-label={copy.home} className="flex items-center gap-2 font-bold"><img src="/media/images/simplelogo.png" alt="" className="h-8 w-8 rounded bg-white p-1" /> <span className="hidden sm:inline">TrailReplay</span></a></div>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-20">
      <div className="grid gap-8 border-b border-[#1c3229]/20 pb-10 md:grid-cols-[1fr_0.38fr] md:items-end">
        <div><p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#ad5425]">{copy.eyebrow}</p>
          <h1 className="text-[3.75rem] leading-[0.95] tracking-[-0.045em] sm:text-[5.75rem]" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}><>{copy.title}</><span className="text-[#c1652f]">.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#52645a] sm:text-lg">{copy.description}</p>
          <p className="mt-3 text-sm text-[#52645a]">{copy.notice}</p>
        </div>
        <div className="border-l-2 border-[#c1652f] py-1 pl-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#65746a]">{copy.latest}</p><p className="mt-2 text-4xl tracking-tight" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>v{releases[0]?.version}</p><p className="mt-1 text-sm text-[#52645a]">{releases[0]?.date}</p></div>
      </div>
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside className="lg:sticky lg:top-8"><label htmlFor="release-search" className="text-xs font-bold uppercase tracking-[0.16em]">{copy.find}</label>
          <div className="relative mt-3"><Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-[#65746a]" /><input id="release-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="w-full rounded-xl border border-[#1c3229]/25 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-[#c1652f] focus:ring-2 focus:ring-[#c1652f]/25" /></div>
          <nav aria-label={copy.versions} className="mt-6 flex flex-wrap gap-2 lg:flex-col lg:items-start">{visible.map((release) => <a key={release.version} href={`#v${release.version}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#52645a] hover:bg-[#e8e2d6] hover:text-[#1c3229]">v{release.version} <span className="ml-1 font-normal text-[#77847c]">{release.date.slice(0, 4)}</span></a>)}</nav>
        </aside>
        <div aria-live="polite" className="space-y-7">{visible.length === 0 && <p className="rounded-2xl border border-[#1c3229]/15 bg-white p-6">{copy.empty}</p>}
          {visible.map((release, index) => <article id={`v${release.version}`} key={release.version} className="scroll-mt-8 overflow-hidden rounded-2xl border border-[#1c3229]/15 bg-white shadow-[0_10px_32px_rgba(28,50,41,0.05)]">
            <div className="border-b border-[#1c3229]/10 bg-[#fcfaf6] px-6 py-6 sm:px-9 sm:py-8"><div className="flex flex-wrap items-center gap-3"><time dateTime={release.date} className="font-mono text-xs font-semibold tracking-wide text-[#65746a]">{release.date}</time>{!query && index === 0 && <span className="rounded-full bg-[#e5eee4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#376443]">{copy.recent}</span>}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl tracking-tight sm:text-4xl" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>{copy.version} {release.version}</h2><a href={`https://github.com/bresca-ai/TrailReplay/releases/tag/v${release.version}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#a54d21] hover:underline">{copy.github} <ArrowUpRight size={15} /></a></div>{release.introduction.map((line) => <p key={line} className="mt-4 max-w-3xl leading-7 text-[#52645a]">{inline(translateNote(language, line))}</p>)}</div>
            <div className="space-y-7 px-6 py-7 sm:px-9">{release.sections.map((section) => <section key={section.title}><h3 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#ad5425]">{translateNote(language, section.title)}</h3><ul className="space-y-3">{section.items.map((item) => <li key={item} className="flex gap-3 text-[15px] leading-7 text-[#40534a]"><span aria-hidden="true" className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c1652f]" /><span>{inline(translateNote(language, item))}</span></li>)}</ul></section>)}</div>
          </article>)}
        </div>
      </div>
    </main>
  </div>;
}

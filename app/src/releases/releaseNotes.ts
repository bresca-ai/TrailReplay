export interface ReleaseSection {
  title: string;
  items: string[];
}

export interface ReleaseNote {
  version: string;
  date: string;
  introduction: string[];
  sections: ReleaseSection[];
}

// The changelog is also the source for GitHub releases. Only dated version
// headings are shown: an unfinished section must not look like a release.
export function parseReleaseNotes(markdown: string): ReleaseNote[] {
  const releases: ReleaseNote[] = [];
  let release: ReleaseNote | undefined;
  let section: ReleaseSection | undefined;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/);
    if (heading) {
      release = { version: heading[1], date: heading[2], introduction: [], sections: [] };
      releases.push(release);
      section = undefined;
    } else if (line.startsWith('## ')) {
      release = undefined;
      section = undefined;
    } else if (release && line.startsWith('### ')) {
      section = { title: line.slice(4), items: [] };
      release.sections.push(section);
    } else if (release && line.startsWith('- ') && section) {
      section.items.push(line.slice(2));
    } else if (release && line && !line.startsWith('[')) {
      if (section) section.items.push(line);
      else release.introduction.push(line);
    }
  }
  return releases;
}

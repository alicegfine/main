// CSV import/export for org rosters.
// Expected columns (header names are matched loosely, case-insensitive):
//   Name        - person's name (required)
//   Title       - role / job title
//   Reports To  - the Name of this person's manager (blank = top of chart)
// Extra recognized columns: "Proposed" (yes/true/1 => a role that doesn't exist yet)
//                           "Note"     (free text shown on hover)

// --- tiny RFC-4180-ish CSV parser (handles quotes, commas, newlines) ---
export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // normalize line endings
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES = {
  name: ["name", "employee", "person", "full name", "fullname"],
  title: ["title", "role", "position", "job title", "job"],
  manager: ["reports to", "reportsto", "manager", "reports", "supervisor", "manager name"],
  proposed: ["proposed", "vacant", "open", "future", "hypothetical"],
  note: ["note", "notes", "comment", "comments"],
};

function matchHeader(h) {
  const key = h.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return canonical;
  }
  return null;
}

function slugId(name, used) {
  const base =
    (name || "role")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "role";
  let id = base;
  let n = 2;
  while (used.has(id)) { id = `${base}-${n++}`; }
  used.add(id);
  return id;
}

const truthy = (v) => /^(y|yes|true|1|x)$/i.test((v || "").trim());

// Returns { people, warnings }
export function peopleFromCsv(text) {
  const rows = parseCsvText(text);
  const warnings = [];
  if (rows.length === 0) return { people: [], warnings: ["The file looked empty."] };

  const header = rows[0].map(matchHeader);
  const hasRecognizedHeader = header.some((h) => h !== null);

  let colName, colTitle, colMgr, colProposed, colNote;
  let dataRows;
  if (hasRecognizedHeader) {
    colName = header.indexOf("name");
    colTitle = header.indexOf("title");
    colMgr = header.indexOf("manager");
    colProposed = header.indexOf("proposed");
    colNote = header.indexOf("note");
    dataRows = rows.slice(1);
  } else {
    // No header recognized: assume positional Name, Title, Reports To.
    warnings.push("No header row recognized — read columns as Name, Title, Reports To.");
    colName = 0; colTitle = 1; colMgr = 2; colProposed = -1; colNote = -1;
    dataRows = rows;
  }
  if (colName < 0) {
    return { people: [], warnings: ["Couldn't find a Name column."] };
  }

  const used = new Set();
  const people = [];
  const nameToId = new Map();

  // First pass: create people + id per row.
  const pending = []; // {person, managerName}
  for (const r of dataRows) {
    const name = (r[colName] || "").trim();
    const title = colTitle >= 0 ? (r[colTitle] || "").trim() : "";
    if (!name && !title) continue; // skip blank line
    const id = slugId(name || title, used);
    const person = {
      id,
      name,
      title,
      managerId: null,
      proposed: colProposed >= 0 ? truthy(r[colProposed]) : false,
      note: colNote >= 0 ? (r[colNote] || "").trim() : "",
    };
    people.push(person);
    if (name) {
      if (nameToId.has(name.toLowerCase())) {
        warnings.push(`Two people are named "${name}" — reporting lines may be ambiguous.`);
      } else {
        nameToId.set(name.toLowerCase(), id);
      }
    }
    pending.push({ person, managerName: colMgr >= 0 ? (r[colMgr] || "").trim() : "" });
  }

  // Second pass: resolve manager names to ids.
  for (const { person, managerName } of pending) {
    if (!managerName) continue;
    const mid = nameToId.get(managerName.toLowerCase());
    if (mid && mid !== person.id) {
      person.managerId = mid;
    } else if (mid === person.id) {
      warnings.push(`"${person.name}" reports to themselves — left at the top.`);
    } else {
      warnings.push(`Couldn't find manager "${managerName}" for ${person.name || person.title} — left at the top.`);
    }
  }

  return { people, warnings };
}

// Serialize people back to CSV (so a scenario can be re-uploaded / kept).
export function peopleToCsv(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["Name", "Title", "Reports To", "Proposed", "Note"].join(",")];
  for (const p of people) {
    const mgr = p.managerId && byId.has(p.managerId) ? byId.get(p.managerId).name || byId.get(p.managerId).title : "";
    lines.push([p.name, p.title, mgr, p.proposed ? "yes" : "", p.note || ""].map(esc).join(","));
  }
  return lines.join("\n");
}

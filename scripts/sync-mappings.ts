// scripts/sync-mappings.ts

import { resolve, join } from "path";
import { readdirSync, readFileSync } from "fs";
import { createDbConnection, closeDbConnection } from "../src/db";
import {
  setCurrentEditorId,
  findOrCreateEditor,
  findOrCreateLanguage,
  findOrCreateAuthor,
  findOrCreateCategory,
  findOrCreateTag,
  getCurrentEditorId,
} from "../src/services/database";
import { sql } from "drizzle-orm";

type MappingFile = {
  [key: string]: string;
};

type MappingKind = "author" | "category" | "subcategory" | "tag";

type UpsertTranslationsParams = {
  mappingType: MappingKind;
  refId: string;
  localName: string;
  languageId: string;
  db: any;
};

async function upsertTranslations({
  mappingType,
  refId,
  localName,
  languageId,
  db,
}: UpsertTranslationsParams) {
  if (!localName) {
    console.log(`Skipping empty localName for ${mappingType} refId=${refId}`);
    return;
  }
  const tableMap = {
    author: "author_translations",
    category: "category_translations",
    subcategory: "sub_category_translations",
    tag: "tag_translations",
  } as const;

  const colMap = {
    author: { ref: "author_id", name: "local_name" },
    category: { ref: "category_id", name: "local_name" },
    subcategory: { ref: "sub_category_id", name: "local_name" },
    tag: { ref: "tag_id", name: "local_name" },
  } as const;

  const table = tableMap[mappingType];
  const refCol = colMap[mappingType].ref;
  const nameCol = colMap[mappingType].name;
  const editorId = getCurrentEditorId();

  console.log(`Upserting translation: Table=${table} RefID=${refId} LangID=${languageId} LocalName=${localName} EditorID=${editorId}`);

  await db.execute(
    sql`
      INSERT INTO ${sql.raw(table)} (${sql.raw(refCol)}, language_id, ${sql.raw(nameCol)}, created_by, updated_by)
      VALUES (${refId}, ${languageId}, ${localName}, ${editorId}, ${editorId})
      ON CONFLICT (${sql.raw(refCol)}, language_id)
      DO UPDATE SET ${sql.raw(nameCol)} = EXCLUDED.${sql.raw(nameCol)}, updated_by = EXCLUDED.updated_by
    `
  );
}

function loadJson(path: string): MappingFile {
  console.log(`Loading JSON mapping file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

async function syncEntityMappings({
  kind,
  mappingFiles,
  db,
}: {
  kind: MappingKind;
  mappingFiles: [string, string][];
  db: any;
}) {
  console.log(`Starting sync for entity type: ${kind}`);

  const enFile = mappingFiles.find(([lang]) => lang === "en");
  let enMap: MappingFile = {};
  if (enFile) {
    enMap = loadJson(enFile[1]) as MappingFile;
  } else {
    console.log(`No English mapping file found for ${kind}`);
  }

  const refMap = new Map<string, string>();

  for (const [localName, englishName] of Object.entries(enMap) as [string, string][]) {
    let refId = "";
    const officialEnglish = String(englishName);
    const officialLocal = String(localName);
    console.log(`[EN] Processing ${kind}: Local='${officialLocal}', English='${officialEnglish}'`);

    switch (kind) {
      case "author":
        refId = await findOrCreateAuthor({ name: officialEnglish, localName: null });
        break;
      case "category":
        refId = await findOrCreateCategory({ name: officialEnglish, localName: null });
        break;
      case "subcategory":
        console.log("[SKIP] Subcategory syncing requires category ID, skipping initial insert");
        continue;
      case "tag":
        refId = await findOrCreateTag({
          name: officialEnglish,
          localName: null,
          slug: officialEnglish.replace(/\s+/g, "-").toLowerCase(),
        });
        break;
    }
    console.log(`[EN] Upserted ${kind} with ID: ${refId}`);
    refMap.set(officialEnglish, refId);
    if (officialLocal === officialEnglish) {
      refMap.set(officialLocal, refId);
    }
  }

  for (const [langCode, filepath] of mappingFiles.filter(([lang]) => lang !== "en")) {
    console.log(`Processing language '${langCode}' mappings for ${kind}...`);
    const data = loadJson(filepath) as MappingFile;
    const languageId = await findOrCreateLanguage({ code: langCode, name: langCode });
    console.log(`Language '${langCode}' resolved to ID: ${languageId}`);

    for (const [localNameRaw, englishNameRaw] of Object.entries(data) as [string, string][]) {
      if (typeof englishNameRaw !== "string") {
        console.warn(`Skipping invalid English name for local '${localNameRaw}':`, englishNameRaw);
        continue;
      }
      const localName = String(localNameRaw);
      const englishName = englishNameRaw;
      console.log(`[${langCode}] Mapping: Local='${localName}', English='${englishName}'`);

      let refId = refMap.get(englishName) ?? "";

      if (!refId) {
        console.log(`[${langCode}] English reference not found, creating ${kind} '${englishName}'`);
        switch (kind) {
          case "author":
            refId = await findOrCreateAuthor({ name: englishName, localName: null });
            break;
          case "category":
            refId = await findOrCreateCategory({ name: englishName, localName: null });
            break;
          case "subcategory":
            console.log("[SKIP] Subcategory syncing requires category ID, skipping");
            continue;
          case "tag":
            refId = await findOrCreateTag({
              name: englishName,
              localName: null,
              slug: englishName.replace(/\s+/g, "-").toLowerCase(),
            });
            break;
        }
        console.log(`[${langCode}] Created ${kind} with ID: ${refId}`);
        refMap.set(englishName, refId);
      }

      await upsertTranslations({
        mappingType: kind,
        refId,
        localName,
        languageId,
        db,
      });
    }
  }
  console.log(`Finished syncing ${kind}`);
}

async function main() {
  const dataDir = resolve(__dirname, "../src/data");
  console.log("Mapping data directory:", dataDir);
  const db = await createDbConnection();
  console.log("✅ Database connected successfully");

  const editorId = await findOrCreateEditor({
    name: process.env.EDITOR_NAME ?? "",
    email: process.env.EDITOR_EMAIL ?? null,
    githubUserName: process.env.EDITOR_GITHUB_USERNAME ?? null,
  });

  console.log(`Setting editor context with ID: ${editorId}`);
  setCurrentEditorId(editorId);

  const files = readdirSync(dataDir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((filename) => {
      const m = filename.match(/\.([a-z]+)\.json$/i);
      return m ? [m[1].toLowerCase(), join(dataDir, filename)] : null;
    })
    .filter((x): x is [string, string] => x !== null);

  console.log("Mapping files found:", files);

  const mappingFiles = {
    author: files.filter(([lang, path]) => path.includes("author-mappings")),
    category: files.filter(([lang, path]) => path.includes("category-mappings")),
    subcategory: files.filter(([lang, path]) => path.includes("subcategory-mappings")),
    tag: files.filter(([lang, path]) => path.includes("tag-mappings")),
  };

  for (const kind of ["author", "category", "tag"] as const) {
    console.log(`Syncing ${kind}s...`);
    await syncEntityMappings({ kind, mappingFiles: mappingFiles[kind], db });
  }

  await closeDbConnection();
  console.log("✅ Mapping sync complete");
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});

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

  // Step 1: Process English mappings first to establish baseline entities
  // Since English files now have English keys -> English/slug values
  for (const [englishKey, englishValue] of Object.entries(enMap) as [string, string][]) {
    let refId = "";
    console.log(`[EN] Processing ${kind}: Key='${englishKey}', Value='${englishValue}'`);

    switch (kind) {
      case "author":
        // For authors, use the key as the name (both key and value are same for English)
        refId = await findOrCreateAuthor({ name: englishKey, localName: null });
        break;
      case "category":
        // For categories, use the key as display name, value as internal slug
        refId = await findOrCreateCategory({ name: englishValue, localName: null });
        break;
      case "subcategory":
        console.log("[SKIP] Subcategory syncing requires category ID, skipping initial insert");
        continue;
      case "tag":
        // For tags, use the key as display name, value as slug
        refId = await findOrCreateTag({
          name: englishKey,
          localName: null,
          slug: englishValue,
        });
        break;
    }
    console.log(`[EN] Upserted ${kind} with ID: ${refId}`);
    refMap.set(englishKey, refId); // Map English key to database ID
  }

  // Step 2: Process translation files (non-English)
  // Now English keys -> Local language values
  for (const [langCode, filepath] of mappingFiles.filter(([lang]) => lang !== "en")) {
    console.log(`Processing language '${langCode}' mappings for ${kind}...`);
    const data = loadJson(filepath) as MappingFile;
    const languageId = await findOrCreateLanguage({ code: langCode, name: langCode });
    console.log(`Language '${langCode}' resolved to ID: ${languageId}`);

    for (const [englishKey, localValue] of Object.entries(data) as [string, string][]) {
      if (typeof localValue !== "string") {
        console.warn(`Skipping invalid local value for English key '${englishKey}':`, localValue);
        continue;
      }

      console.log(`[${langCode}] Mapping: EnglishKey='${englishKey}', LocalValue='${localValue}'`);

      let refId = refMap.get(englishKey) ?? "";

      if (!refId) {
        console.log(`[${langCode}] English reference not found for '${englishKey}', creating ${kind}`);
        switch (kind) {
          case "author":
            refId = await findOrCreateAuthor({ name: englishKey, localName: null });
            break;
          case "category":
            // Use a default slug based on English key if not found in English mappings
            refId = await findOrCreateCategory({ name: englishKey.toLowerCase().replace(/\s+/g, "-"), localName: null });
            break;
          case "subcategory":
            console.log("[SKIP] Subcategory syncing requires category ID, skipping");
            continue;
          case "tag":
            refId = await findOrCreateTag({
              name: englishKey,
              localName: null,
              slug: englishKey.toLowerCase().replace(/\s+/g, "-"),
            });
            break;
        }
        console.log(`[${langCode}] Created ${kind} with ID: ${refId}`);
        refMap.set(englishKey, refId);
      }

      // Insert translation: English key maps to local language value
      await upsertTranslations({
        mappingType: kind,
        refId,
        localName: localValue, // This is now the localized name
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

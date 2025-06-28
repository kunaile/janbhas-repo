const fs = require('fs')
const path = require('path')

const contentDir = path.resolve(__dirname, '../content') // Adjust path if your content dir is elsewhere
const recordJsonPath = path.resolve(__dirname, '../content/record.json') // Path to where record.json should be

// Define the structure of your record.json (matching your TypeScript)
// We'll also add a 'title' field here if it exists in frontmatter
const generateRecordJson = async () => {
  console.log('Starting record.json generation...')
  let articles = []

  // Function to recursively read directories and find markdown files
  const readMarkdownFiles = (dir) => {
    const files = fs.readdirSync(dir)

    files.forEach((file) => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        readMarkdownFiles(filePath) // Recurse into subdirectories
      } else if (file.endsWith('.md')) {
        // Determine lang from directory structure (e.g., content/en/article.md -> lang: en)
        const relativePath = path.relative(contentDir, filePath) // e.g., 'en/sample.md'
        const parts = relativePath.split(path.sep) // Split by platform-specific separator

        // Assuming content structure is like: content/<lang>/<filename>.md
        // So, parts[0] would be 'en' or 'hi'
        let lang = 'en' // Default language
        if (parts.length >= 2) {
          lang = parts[0]
        }

        // Create slug - matching your getRecordsData logic
        const filenameWithoutExt = path.basename(file, '.md')
        const slug = `${filenameWithoutExt}_${lang}`

        // --- Optional: Read frontmatter to get a title ---
        let title = filenameWithoutExt.replace(/_/g, ' ') // Default title from filename
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8')
          const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/)
          if (frontmatterMatch && frontmatterMatch[1]) {
            const frontmatterLines = frontmatterMatch[1].split('\n')
            for (const line of frontmatterLines) {
              if (line.startsWith('title:')) {
                title = line
                  .substring('title:'.length)
                  .trim()
                  .replace(/^['"]|['"]$/g, '')
                break
              }
            }
          }
        } catch (e) {
          console.warn(
            `Could not read frontmatter for ${filePath}: ${e.message}`
          )
        }
        // --------------------------------------------------

        articles.push({
          filepath: `content/${relativePath.replace(/\\/g, '/')}`, // Ensure POSIX paths for GitHub
          lang: lang,
          slug: slug,
          title: title, // Include the title
        })
      }
    })
  }

  readMarkdownFiles(contentDir)

  // Sort articles for consistent output (optional but good practice)
  articles.sort((a, b) => a.filepath.localeCompare(b.filepath))

  const recordsData = {
    // Optional: add a timestamp for when this record.json was generated
    // lastGenerated: new Date().toISOString(),
    lastModified: new Date().toISOString(), // Current UTC timestamp
    articles: articles,
  }

  try {
    fs.writeFileSync(recordJsonPath, JSON.stringify(recordsData, null, 2))
    console.log(`Successfully generated record.json at ${recordJsonPath}`)
  } catch (error) {
    console.error(`Error writing record.json: ${error.message}`)
    process.exit(1) // Exit with error code
  }
}

generateRecordJson()

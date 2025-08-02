const fs = require('fs')
const path = require('path')
const { parseFrontmatter } = require('./frontmatterParser')

/**
 * Processes a single markdown file and extracts article data
 * @param {string} filePath - Path to the markdown file
 * @param {string} contentDir - Base content directory
 * @returns {object|null} - Article object or null if processing fails
 */
const processMarkdownFile = (filePath, contentDir) => {
  try {
    const relativePath = path.relative(contentDir, filePath)
    const parts = relativePath.split(path.sep)

    // Extract language from directory structure
    const lang = parts.length >= 2 ? parts[0] : 'en'

    // Create slug
    const filenameWithoutExt = path.basename(filePath, '.md')
    const slug = `${filenameWithoutExt}_${lang}`

    // Read and parse file
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const frontmatter = parseFrontmatter(fileContent)
    const stats = fs.statSync(filePath)

    // Build article object with defaults
    return {
      title: frontmatter.title || filenameWithoutExt.replace(/_/g, ' '),
      author: frontmatter.author || 'Unknown',
      filepath: `content/${relativePath.replace(/\\/g, '/')}`,
      lang: frontmatter.lang || lang,
      slug: slug,
      category: frontmatter.category || 'Uncategorized',
      // thumbnail: frontmatter.thumbnail || '',
      // audio: frontmatter.audio || '',
      date: frontmatter.date || '',
      lastModified: stats.mtime.toISOString(),
    }
  } catch (error) {
    console.warn(`Failed to process ${filePath}: ${error.message}`)
    return null
  }
}

module.exports = { processMarkdownFile }

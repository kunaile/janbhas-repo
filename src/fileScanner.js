const fs = require('fs')
const path = require('path')

/**
 * Recursively scans directory for markdown files
 * @param {string} dir - Directory to scan
 * @param {Array} markdownFiles - Array to collect file paths
 */
const scanForMarkdownFiles = (dir, markdownFiles = []) => {
  try {
    const files = fs.readdirSync(dir)

    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        scanForMarkdownFiles(filePath, markdownFiles)
      } else if (file.endsWith('.md')) {
        markdownFiles.push(filePath)
      }
    }
  } catch (error) {
    console.warn(`Failed to scan directory ${dir}: ${error.message}`)
  }

  return markdownFiles
}

module.exports = { scanForMarkdownFiles }

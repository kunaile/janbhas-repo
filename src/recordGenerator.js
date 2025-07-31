const fs = require('fs')
const path = require('path')
const { scanForMarkdownFiles } = require('./fileScanner')
const { processMarkdownFile } = require('./articleProcessor')

class RecordGenerator {
  constructor(contentDir, outputPath) {
    this.contentDir = path.resolve(contentDir)
    this.outputPath = path.resolve(outputPath)
  }

  /**
   * Generates record.json from markdown files
   */
  async generate() {
    console.log('Starting record.json generation...')

    try {
      // Scan for markdown files
      const markdownFiles = scanForMarkdownFiles(this.contentDir)
      console.log(`Found ${markdownFiles.length} markdown files`)

      // Process files in parallel for better performance
      const articles = await this.processFilesInParallel(markdownFiles)

      // Filter out failed processing attempts
      const validArticles = articles.filter((article) => article !== null)

      // Sort for consistent output
      validArticles.sort((a, b) => a.filepath.localeCompare(b.filepath))

      // Generate final record
      const recordData = {
        lastModified: new Date().toISOString(),
        totalArticles: validArticles.length,
        articles: validArticles,
      }

      // Write to file
      await this.writeRecord(recordData)

      console.log(
        `Successfully generated record.json with ${validArticles.length} articles`
      )
      return recordData
    } catch (error) {
      console.error(`Error generating record.json: ${error.message}`)
      throw error
    }
  }

  /**
   * Process multiple files in parallel with concurrency control
   * @param {Array} markdownFiles - Array of file paths
   * @returns {Promise<Array>} - Array of processed articles
   */
  async processFilesInParallel(markdownFiles, concurrency = 10) {
    const articles = []

    for (let i = 0; i < markdownFiles.length; i += concurrency) {
      const batch = markdownFiles.slice(i, i + concurrency)
      const batchPromises = batch.map((filePath) =>
        Promise.resolve(processMarkdownFile(filePath, this.contentDir))
      )

      const batchResults = await Promise.all(batchPromises)
      articles.push(...batchResults)
    }

    return articles
  }

  /**
   * Writes record data to JSON file
   * @param {object} recordData - The record data to write
   */
  async writeRecord(recordData) {
    return new Promise((resolve, reject) => {
      fs.writeFile(
        this.outputPath,
        JSON.stringify(recordData, null, 2),
        'utf8',
        (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }
      )
    })
  }
}

module.exports = { RecordGenerator }

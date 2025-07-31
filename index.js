const path = require('path')
const { RecordGenerator } = require('./src/recordGenerator')

// Configuration
const contentDir = path.resolve(__dirname, './content')
const recordJsonPath = path.resolve(__dirname, './content/record.json')

// Generate record.json
const generator = new RecordGenerator(contentDir, recordJsonPath)

generator
  .generate()
  .then((recordData) => {
    console.log(`✅ Record generation completed successfully`)
    console.log(`📄 Total articles: ${recordData.totalArticles}`)
  })
  .catch((error) => {
    console.error('❌ Record generation failed:', error.message)
    process.exit(1)
  })

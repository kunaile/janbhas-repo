/**
 * Parses frontmatter from markdown content
 * @param {string} content - The markdown file content
 * @returns {object} - Parsed frontmatter object
 */
const parseFrontmatter = (content) => {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

  if (!frontmatterMatch || !frontmatterMatch[1]) {
    return {}
  }

  const frontmatter = {}
  const lines = frontmatterMatch[1].split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine || !trimmedLine.includes(':')) continue

    const colonIndex = trimmedLine.indexOf(':')
    const key = trimmedLine.substring(0, colonIndex).trim()
    const value = trimmedLine
      .substring(colonIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')

    if (key) {
      frontmatter[key] = value
    }
  }

  return frontmatter
}

module.exports = { parseFrontmatter }

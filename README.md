# Hypernym MCP Server

MCP server providing semantic text analysis and compression tools via Hypernym AI.

## Tools

### analyze_text
Full semantic analysis of text including categorization and compression metrics.

Parameters:
- `text` (required): Input text
- `minCompressionRatio` (optional): Target compression (0.0-1.0, default: 0.5)
- `minSemanticSimilarity` (optional): Target similarity (0.0-1.0, default: 0.8)

Returns: Full analysis including semantic categories, compression metrics, and reconstructed text.

### semantic_compression
Direct text compression maintaining semantic meaning.

Parameters:
- `text` (required): Input text
- `minCompressionRatio` (optional): Target compression (0.0-1.0, default: 0.5)
- `minSemanticSimilarity` (optional): Target similarity (0.0-1.0, default: 0.8)

Returns: Suggested text that preserves core meaning while maintaining readability.

## Environment

Required: `HYPERNYM_API_KEY`

Contact: chris@hypernym.ai

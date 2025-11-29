// api/get.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow both GET and POST (for backward compatibility)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    // Get file from query string OR body (support both)
    const fileFromQuery = req.query.file;
    const fileFromBody = req.body?.file;
    const file = fileFromQuery || fileFromBody;

    // Validate file parameter
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'File parameter is required (use ?file=filename in URL)' 
      });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      console.error('Missing GitHub configuration');
      return res.status(500).json({ 
        phones: [],
        error: 'GitHub configuration missing'
      });
    }

    const filePath = `data/${file}.json`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

    // Try to get file from GitHub
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-API'
      }
    });

    if (response.status === 404) {
      // File doesn't exist yet - return empty array
      console.log(`File ${filePath} not found, returning empty array`);
      return res.status(200).json({
        phones: []
      });
    }

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status}`);
      return res.status(200).json({
        phones: []
      });
    }

    const data = await response.json();
    
    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const phones = JSON.parse(content);

    console.log(`GET request for file: ${file}, Total phones: ${phones.length}`);

    return res.status(200).json({
      phones: Array.isArray(phones) ? phones : []
    });

  } catch (error) {
    console.error('Error in get.js:', error.message);
    return res.status(200).json({
      phones: []
    });
  }
}

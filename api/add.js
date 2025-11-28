// api/add.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    const { file, phone } = req.body;

    // Validate file parameter
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'File parameter is required' 
      });
    }

    // Validate phone number
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    const trimmedPhone = phone.trim();

    if (trimmedPhone.length !== 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number must be 10 digits' 
      });
    }

    if (!/^\d+$/.test(trimmedPhone)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number must contain only digits' 
      });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(500).json({ 
        success: false, 
        message: 'GitHub configuration missing' 
      });
    }

    const filePath = `data/${file}.json`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

    // Get existing file
    const getResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-API'
      }
    });

    let phones = [];
    let sha = null;

    if (getResponse.ok) {
      // File exists - get current content
      const fileData = await getResponse.json();
      sha = fileData.sha;
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      phones = JSON.parse(content);
    }
    // If 404, file doesn't exist - will create new

    // Check for duplicates
    if (phones.includes(trimmedPhone)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number already exists' 
      });
    }

    // Add new phone
    phones.push(trimmedPhone);

    // Prepare content for GitHub
    const newContent = JSON.stringify(phones, null, 2);
    const encodedContent = Buffer.from(newContent).toString('base64');

    // Update or create file on GitHub
    const updateResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-API'
      },
      body: JSON.stringify({
        message: `Add phone ${trimmedPhone} to ${file}`,
        content: encodedContent,
        sha: sha, // null if creating new file
        committer: {
          name: 'Phone API',
          email: 'api@phone.app'
        }
      })
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('GitHub update error:', errorData);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update GitHub file' 
      });
    }

    console.log(`Phone added to ${file}: ${trimmedPhone}, Total: ${phones.length}`);

    return res.status(200).json({ 
      success: true, 
      message: 'Phone number added successfully',
      total: phones.length
    });

  } catch (error) {
    console.error('Error in add.js:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}

// api/admin/bulk-add.js
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
    const { file, phones } = req.body;

    // Validate file parameter
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'File parameter is required' 
      });
    }

    // Validate phones array
    if (!phones || !Array.isArray(phones)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phones must be an array' 
      });
    }

    if (phones.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phones array cannot be empty' 
      });
    }

    // Validate each phone number
    const invalidPhones = [];
    const validPhones = [];

    for (let phone of phones) {
      const trimmedPhone = String(phone).trim();
      
      if (trimmedPhone.length !== 10 || !/^\d+$/.test(trimmedPhone)) {
        invalidPhones.push(phone);
      } else {
        validPhones.push(trimmedPhone);
      }
    }

    if (invalidPhones.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Some phone numbers are invalid',
        invalid: invalidPhones
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

    let existingPhones = [];
    let sha = null;

    if (getResponse.ok) {
      // File exists
      const fileData = await getResponse.json();
      sha = fileData.sha;
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      existingPhones = JSON.parse(content);
    }

    // Track duplicates and new phones
    const duplicates = [];
    const newPhones = [];

    for (let phone of validPhones) {
      if (existingPhones.includes(phone)) {
        duplicates.push(phone);
      } else {
        newPhones.push(phone);
        existingPhones.push(phone);
      }
    }

    // Only update if there are new phones
    if (newPhones.length > 0) {
      // Prepare content for GitHub
      const newContent = JSON.stringify(existingPhones, null, 2);
      const encodedContent = Buffer.from(newContent).toString('base64');

      // Update file on GitHub
      const updateResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Vercel-API'
        },
        body: JSON.stringify({
          message: `Bulk add ${newPhones.length} phones to ${file}`,
          content: encodedContent,
          sha: sha,
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
    }

    console.log(`Bulk add to ${file}: ${newPhones.length} new, ${duplicates.length} duplicates`);

    return res.status(200).json({ 
      success: true, 
      message: 'Bulk add completed',
      added: newPhones.length,
      duplicates: duplicates.length,
      total: existingPhones.length,
      duplicatePhones: duplicates
    });

  } catch (error) {
    console.error('Error in bulk-add.js:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}

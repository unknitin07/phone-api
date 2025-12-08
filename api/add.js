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
    // Get file from query string OR body (backward compatible)
    const fileFromQuery = req.query.file;
    const fileFromBody = req.body.file;
    const file = fileFromQuery || fileFromBody;

    // Get phone from body
    const phone = req.body.phone;

    // Validate file parameter
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'File parameter is required (use ?file=filename in URL)' 
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

    // Retry logic for handling conflicts
    const maxRetries = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      try {
        attempt++;

        // Get existing file (fresh each attempt)
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

        if (updateResponse.ok) {
          // Success!
          console.log(`Phone added to ${file}: ${trimmedPhone}, Total: ${phones.length} (attempt ${attempt})`);
          return res.status(200).json({ 
            success: true, 
            message: 'Phone number added successfully',
            total: phones.length
          });
        }

        const errorData = await updateResponse.json();

        // If conflict (409), retry
        if (updateResponse.status === 409 && attempt < maxRetries) {
          console.log(`Conflict detected, retrying... (attempt ${attempt}/${maxRetries})`);
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }

        // Other error
        console.error('GitHub update error:', errorData);
        lastError = errorData;
        break;

      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);
        lastError = error;
        
        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }
        break;
      }
    }

    // All retries failed
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update file after multiple attempts',
      error: lastError?.message || 'Unknown error'
    });

  } catch (error) {
    console.error('Error in add.js:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}

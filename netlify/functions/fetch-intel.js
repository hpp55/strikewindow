// netlify/functions/fetch-intel.js
// Server-side proxy for Anthropic API — keeps the API key out of the browser
// Deployed automatically by Netlify when placed in netlify/functions/
 
exports.handler = async function(event, context) {
 
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
 
  // CORS headers — allow requests from your domain
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
 
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
 
  try {
    const { species, spName, today } = JSON.parse(event.body);
 
    // API key stored in Netlify environment variables — never in the HTML
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }
 
    const prompt = `Today is ${today}. You are a fishing intelligence assistant for Sydney, NSW, Australia.
 
Search the web for the most recent Sydney offshore fishing reports specifically for ${spName}.
 
Search these sources:
- Deckee community fishing reports Sydney
- Fishing Station Mona Vale Facebook recent posts  
- Sydney Game Fishing Club reports
- Fishare.app Sydney forecast
- Recent Facebook fishing groups Sydney offshore ${spName}
- YouTube fishing report Sydney this week
 
Return ONLY a valid JSON object with this exact structure, no markdown, no other text:
{
  "bait": {
    "value": "heavy|moderate|light|none|unknown",
    "display": "Short status max 6 words",
    "detail": "What you actually found in reports about bait. Quote sources. Max 2 sentences.",
    "tier": "hot|warn|cold"
  },
  "reports": {
    "value": "red-hot|good|slow|dead|unknown",
    "display": "Short status max 6 words",
    "detail": "What actual trip reports say about ${spName} catches. Quote specific sources. Max 2 sentences.",
    "tier": "hot|warn|cold"
  },
  "colour": {
    "value": "hard-wall|soft|mixed|flat|unknown",
    "display": "Short status max 6 words",
    "detail": "What sources say about water colour, SST breaks, EAC position off Sydney. Max 2 sentences.",
    "tier": "hot|warn|cold"
  },
  "hotspot": {
    "value": "location name",
    "display": "Top active marks max 8 words",
    "detail": "Specific marks or areas mentioned in reports for ${spName} off Sydney. Include distances if mentioned. Max 2 sentences.",
    "tier": "hot|warn|cold"
  },
  "gap": 20,
  "sourceDate": "date of most recent report found",
  "confidence": "high|medium|low"
}
 
If you cannot find reports from the last 14 days, set confidence to low and be honest about it in the detail fields. Do NOT fabricate information.`;
 
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'API error' })
      };
    }
 
    // Extract the text response block
    let jsonText = '';
    for (const block of data.content || []) {
      if (block.type === 'text' && block.text) {
        jsonText = block.text;
        break;
      }
    }
 
    // Strip any markdown fences just in case
    const clean = jsonText.replace(/```json|```/g, '').trim();
 
    // Validate it's parseable JSON before sending back
    JSON.parse(clean);
 
    return {
      statusCode: 200,
      headers,
      body: clean
    };
 
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};

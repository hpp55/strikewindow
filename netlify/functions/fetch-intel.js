// netlify/functions/fetch-intel.js
exports.handler = async function(event, context) {
 
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
 
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
 
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
 
  try {
    const { species, spName, today } = JSON.parse(event.body);
 
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
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
 
You MUST return ONLY a valid JSON object. No introduction, no explanation, no markdown. Start your response with { and end with }.
 
{
  "bait": {
    "value": "heavy or moderate or light or none or unknown",
    "display": "Short status max 6 words",
    "detail": "What you found about bait. Quote sources. Max 2 sentences.",
    "tier": "hot or warn or cold"
  },
  "reports": {
    "value": "red-hot or good or slow or dead or unknown",
    "display": "Short status max 6 words",
    "detail": "What trip reports say about ${spName} catches. Quote sources. Max 2 sentences.",
    "tier": "hot or warn or cold"
  },
  "colour": {
    "value": "hard-wall or soft or mixed or flat or unknown",
    "display": "Short status max 6 words",
    "detail": "What sources say about water colour and EAC off Sydney. Max 2 sentences.",
    "tier": "hot or warn or cold"
  },
  "hotspot": {
    "value": "location name",
    "display": "Top active marks max 8 words",
    "detail": "Specific marks mentioned for ${spName} off Sydney. Max 2 sentences.",
    "tier": "hot or warn or cold"
  },
  "gap": 20,
  "sourceDate": "date of most recent report found",
  "confidence": "high or medium or low"
}
 
If you cannot find reports from the last 14 days, set confidence to low. Do NOT fabricate information.`;
 
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
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || 'API error' }) };
    }
 
    // Extract text from response blocks
    let jsonText = '';
    for (const block of data.content || []) {
      if (block.type === 'text' && block.text) {
        jsonText += block.text;
      }
    }
 
    // Pull the JSON object out of whatever text surrounds it
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response: ' + jsonText.substring(0, 100));
    }
 
    const clean = jsonMatch[0].trim();
 
    // Validate it parses
    JSON.parse(clean);
 
    return { statusCode: 200, headers, body: clean };
 
  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

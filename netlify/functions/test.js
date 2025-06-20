exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Test function works!',
      timestamp: new Date().toISOString(),
      hasApiKey: !!process.env.airtable_key
    })
  };
};
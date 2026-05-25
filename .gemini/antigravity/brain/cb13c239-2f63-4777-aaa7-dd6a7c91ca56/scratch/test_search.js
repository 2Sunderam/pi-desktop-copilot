// Parse duckduckgo html
async function testSearch() {
  const query = "Nodejs fetch";
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();

    const results = [];
    // Split the html by results block
    const blocks = html.split('<div class="result results_links');
    // The first block is header, ignore it
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      
      // Extract title and relative link
      // <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=URL&...">TITLE</a>
      const titleMatch = block.match(/<a\s+[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a\s+[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      
      if (titleMatch) {
        let rawUrl = titleMatch[1];
        let title = titleMatch[2].replace(/<[^>]*>/g, '').trim(); // Remove any HTML tags like <b>
        let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

        // Decode the actual URL from the uddg parameter
        let actualUrl = rawUrl;
        if (rawUrl.includes('uddg=')) {
          const parts = rawUrl.split('uddg=');
          if (parts[1]) {
            const encodedUrl = parts[1].split('&')[0];
            actualUrl = decodeURIComponent(encodedUrl);
          }
        } else if (rawUrl.startsWith('//')) {
          actualUrl = 'https:' + rawUrl;
        }

        results.push({
          title,
          url: actualUrl,
          snippet
        });
      }
    }

    console.log("Parsed results count:", results.length);
    console.log("First 3 results:");
    console.log(JSON.stringify(results.slice(0, 3), null, 2));

  } catch (error) {
    console.error("Error:", error);
  }
}

testSearch();

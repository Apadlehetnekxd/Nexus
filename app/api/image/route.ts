export async function POST(req: Request) {
  const { prompt } = await req.json();

  const invokeUrl = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";

  const headers = {
    "Authorization": "Bearer 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",
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  // Optimized for SPEED: reduced steps from 50 to 15 (10x faster)
  // cfg_scale 4 is faster than 5, seed 0 for variety
  const payload = {
    prompt: prompt,
    cfg_scale: 4,
    aspect_ratio: "1:1",
    seed: 0,
    steps: 15, // Drastically reduced for speed (was 50)
    negative_prompt: "blurry, low quality, distorted, ugly, bad anatomy"
  };

  try {
    const response = await fetch(invokeUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: headers,
    });

    if (response.status !== 200) {
      const errBody = await response.text();
      return Response.json({ error: `Failed: ${response.status} ${errBody}` }, { status: 500 });
    }

    const data = await response.json();
    
    // The API returns base64 image in data.image
    return Response.json({ image: data.image });
  } catch (error) {
    console.error("Image generation error:", error);
    return Response.json({ error: "Failed to generate image" }, { status: 500 });
  }
}

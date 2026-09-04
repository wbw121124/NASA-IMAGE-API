// src/index.js
export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    try {
      const url = new URL(request.url);
      let date = url.searchParams.get('date');
      const mode = url.searchParams.get('mode') || 'json';
      const last = url.searchParams.get('last');

      // 处理 last 参数：计算前第 n 天的日期
      if (last !== null && last !== undefined && last !== '') {
        const daysAgo = parseInt(last, 10);
        if (isNaN(daysAgo) || daysAgo < 0) {
          return new Response(JSON.stringify({ 
            error: 'Invalid last parameter. Must be a non-negative integer' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysAgo);
        date = targetDate.toISOString().split('T')[0];
      } else if (!date) {
        // 如果没有 date 也没有 last，使用今天的日期
        date = new Date().toISOString().split('T')[0];
      }

      // 验证日期格式
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // 使用环境变量中的 NASA API Key
      const nasaApiKey = env.NASA_API_KEY || 'DEMO_KEY';
      const nasaUrl = `https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}&date=${date}`;

      const nasaResponse = await fetch(nasaUrl);
      if (!nasaResponse.ok) {
        const errorText = await nasaResponse.text();
        return new Response(JSON.stringify({
          error: 'NASA API error',
          status: nasaResponse.status,
          message: errorText
        }), {
          status: nasaResponse.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const apodData = await nasaResponse.json();

      switch (mode) {
        case 'image':
          if (apodData.media_type === 'image') {
            const imageResponse = await fetch(apodData.url);
            const imageBuffer = await imageResponse.arrayBuffer();
            return new Response(imageBuffer, {
              headers: {
                'Content-Type': imageResponse.headers.get('Content-Type') || 'image/jpeg',
                ...corsHeaders
              }
            });
          }
          return new Response(JSON.stringify({ error: 'Media is not an image' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        case 'redirect':
          if (apodData.media_type === 'image') {
            return Response.redirect(apodData.url, 302);
          }
          return new Response(JSON.stringify({ error: 'Media is not an image' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        case 'json':
          return new Response(JSON.stringify({
            date: apodData.date,
            title: apodData.title,
            explanation: apodData.explanation,
            url: apodData.url
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        case 'translate':
          const encodedText = encodeURIComponent(apodData.explanation);
          const encodedTitle = encodeURIComponent(apodData.title);
          const translateUrl = `https://translate.amlg.top/?text=${encodedText}&to=zh-CHS`;
          const translateTitleUrl = `https://translate.amlg.top/?text=${encodedTitle}&to=zh-CHS`;

          let translatedExplanation = apodData.explanation;
          let translatedTitle = apodData.title;
          
          try {
            const [explanationRes, titleRes] = await Promise.all([
              fetch(translateUrl),
              fetch(translateTitleUrl)
            ]);
            
            if (explanationRes.ok) {
              const result = await explanationRes.json();
              translatedExplanation = result.translate || translatedExplanation;
            }
            
            if (titleRes.ok) {
              const result = await titleRes.json();
              translatedTitle = result.translate || translatedTitle;
            }
          } catch (e) {
            console.error('Translation failed:', e);
          }

          return new Response(JSON.stringify({
            date: apodData.date,
            title: apodData.title,
            title_cn: translatedTitle,
            explanation: apodData.explanation,
            explanation_cn: translatedExplanation,
            url: apodData.url
          }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });

        default:
          return new Response(JSON.stringify({
            error: 'Invalid mode',
            available_modes: ['image', 'redirect', 'json', 'translate']
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

/** @type {import('next').NextConfig} */
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "";

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ae01.alicdn.com" },
      { protocol: "https", hostname: "g-search3.alicdn.com" },
      { protocol: "https", hostname: "shop-phinf.pstatic.net" },
      { protocol: "https", hostname: "thumbnail.coupangcdn.com" },
      { protocol: "https", hostname: "cdn.011st.com" },
      { protocol: "http", hostname: "cdn.011st.com" },
      { protocol: "https", hostname: "image.gmarket.co.kr" },
      { protocol: "https", hostname: "g-search1.gmarket.co.kr" },
      { protocol: "https", hostname: "g-search2.gmarket.co.kr" },
      { protocol: "https", hostname: "g-search3.gmarket.co.kr" },
      { protocol: "https", hostname: "image.g9.co.kr" },
      { protocol: "https", hostname: "gdimg.gmarket.co.kr" },
      ...(supabaseHostname
        ? [{ protocol: /** @type {const} */ ("https"), hostname: supabaseHostname }]
        : [])
    ]
  }
};

export default nextConfig;

import { MetadataRoute } from 'next';

const BASE_URL = 'https://ai5k.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '',
    // '/verification',
    // '/buyers',
    // '/builders',
  ].map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  return routes;
}

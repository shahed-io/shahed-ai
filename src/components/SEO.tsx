import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description?: string;
  path?: string; // route path, e.g. "/auth"
  noindex?: boolean;
  jsonLd?: object | object[];
  image?: string;
}

const SITE = "https://ai.shahed.com.bd";
const DEFAULT_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2b06770a-2743-4d64-b02a-b6e103d08955/id-preview-31e6ff37--192d1d58-69cf-4807-ad77-e1ef9d87ed87.lovable.app-1772468200120.png";

/**
 * Per-route head tags. Mounts canonical, og:url, robots, and optional JSON-LD.
 * Sitewide fallbacks live in index.html.
 */
export default function SEO({
  title,
  description,
  path = "/",
  noindex,
  jsonLd,
  image = DEFAULT_IMAGE,
}: SEOProps) {
  const url = `${SITE}${path}`;
  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      {noindex ? (
        <meta name="robots" content="noindex,nofollow" />
      ) : (
        <meta name="robots" content="index,follow,max-image-preview:large" />
      )}

      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />

      {ldArray.map((obj, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(obj)}
        </script>
      ))}
    </Helmet>
  );
}

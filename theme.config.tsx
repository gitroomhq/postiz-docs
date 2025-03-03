import Image from "next/image";
import { useRouter } from "next/router";
import { DocsThemeConfig, useConfig } from "nextra-theme-docs";

const themeConfig: DocsThemeConfig = {
  head: () => {
    const router = useRouter();
    const { title, ...rest } = useConfig();

    const pagePath = router.asPath;
    const ogImageUrl = `https://docs.Publica.com/api/opengraph-image?title=${title}`;

    const ogTitle = `${title} - Publica Docs`;

    return (
      <>
        <title>{ogTitle}</title>

        <meta name="viewport" content="width=device-width" />
        <meta name="application-name" content="Publica" />
        <meta name="msapplication-TileColor" content="#4f46e5" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="charset" content="utf-8" />
        <meta
          property="description"
          content="Publica - Open source social media scheduling tool"
        />

        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href={pagePath} />

        <meta
          property="og:description"
          content="Publica - Open source social media scheduling tool"
        />
        <meta property="og:site_name" content="Publica Documentation" />
        <meta name="og:url" content={`https://docs.Publica.com/${pagePath}`} />
        <meta name="og:title" content={ogTitle} />
        <meta name="og:image" content={ogImageUrl} />
        <meta name="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content="Publica Documentation" />
        <meta name="twitter:image" content={ogImageUrl} />
      </>
    );
  },
  logo: (
    <div className="nx-flex nx-items-center nx-gap-2">
      <Image src="/logo/dark.png" alt="Publica" height={34} width={130} />
      <span className="nx-font-semibold nx-text-white">Docs</span>
    </div>
  ),
  project: {
    link: "https://github.com/gitroomhq/Publica-app",
  },
  chat: {
    link: "https://discord.Publica.com",
  },
  docsRepositoryBase: "https://github.com/gitroomhq/Publica-docs/blob/main",
  footer: {
    content: "Gitroom Limited. All rights reserved.",
  },
  darkMode: false,
  nextThemes: {
    defaultTheme: "dark",
    forcedTheme: "dark",
  },
  color: {
	  hue: 280,
	  saturation: 100,
  }
};

export default themeConfig;

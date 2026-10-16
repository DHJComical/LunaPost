import type { Catalog } from './index.js'
import enUS from './locales/catalog.en-US.js'
import zhCN from './locales/catalog.zh-CN.js'

export const exampleCatalogForLocale = (locale: 'zh-CN' | 'en-US' = 'zh-CN'): Catalog => {
  const copy = locale === 'en-US' ? enUS : zhCN
  return {

    schemaVersion: 1,
    catalogRevision: 'local-dev',
    generatedAt: '2026-10-14T00:00:00.000Z',
    projects: [
      {
        id: 'example-mod',
        slug: 'example-mod',
        title: 'Example Mod',
        type: 'mod',
        description: copy.description,
        ownerType: 'account',
        body: copy.body,
        categories: ['adventure', 'optimization'],
        keywords: ['example', 'demo'],
        clientSide: 'optional',
        serverSide: 'optional',
        status: 'approved',
        featured: true,
        downloads: 12840,
        followers: 238,
        iconUrls: [],
        gallery: [],
        repositoryUrl: 'https://github.com/example/example-mod',
        sourceUrl: 'https://github.com/example/example-mod',
        issuesUrl: 'https://github.com/example/example-mod/issues',
        cdnRules: [
          {
            id: 'github-cdn',
            label: copy.cdnRuleLabel,
            template: 'https://github.com/example/example-mod/releases/download/v{version}/{filename}',
            region: 'GLOBAL',
            priority: 5,
            enabled: true,
          },
        ],
        donationUrls: [],
        links: [],
        license: 'MIT',
        licenses: [],
        loaders: ['fabric'],
        gameVersions: ['1.21.1'],
        versions: [
          {
            id: 'example-mod-1.0.0',
            version: '1.0.0',
            type: 'release',
            status: 'listed',
            featured: true,
            dependencies: [],
            gameVersions: ['1.21.1'],
            loaders: ['fabric'],
            changelog: copy.changelog,
            files: [
              {
                id: 'example-mod-1.0.0-jar',
                name: 'example-mod-1.0.0.jar',
                primary: true,
                fileType: 'mod',
                reviewStatus: 'approved',
                metadata: {},
                sources: [
                  {
                    id: 'github',
                    kind: 'github_release',
                    region: 'GLOBAL',
                    url: 'https://github.com/example/example-mod/releases/download/v1.0.0/example-mod-1.0.0.jar',
                    priority: 10,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

export const exampleCatalog: Catalog = exampleCatalogForLocale()

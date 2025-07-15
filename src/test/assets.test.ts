import {DocumentDefinition} from '@sanity/types'
import type {ContentTypeProps} from 'contentful-management'
import {beforeEach, describe, expect, test, vi, afterEach} from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import contentfulExport, {type Options as ContentfulExportOptions} from 'contentful-export'
import type {ContentfulExportField} from 'contentful-export/types'

import {contentfulTypeToSanitySchema} from '../utils'
import {exportAction} from '../actions/exportAction'

// Мокаем contentful-export
vi.mock('contentful-export', () => ({
  default: vi.fn().mockResolvedValue({
    tags: [],
    entries: [],
    contentTypes: [],
    assets: [
      {
        sys: {id: 'asset1'},
        fields: {
          title: 'Test Asset',
          file: {
            url: 'https://example.com/test.jpg',
            fileName: 'test.jpg',
            contentType: 'image/jpeg',
          },
        },
      },
    ],
    editorInterfaces: [],
    webhooks: [],
    roles: [],
    locales: [],
  } satisfies Record<ContentfulExportField, unknown[]>),
}))

// Мокаем вспомогательные модули
vi.mock('@stdlib/assert-is-absolute-path', () => ({
  default: () => true,
}))
vi.mock('tiny-invariant', () => ({
  default: vi.fn(),
}))
vi.mock('mkdirp', () => ({
  mkdirp: vi.fn().mockResolvedValue(undefined),
}))

interface LocalTestContext {
  schemas: DocumentDefinition[]
}

beforeEach<LocalTestContext>(async (context) => {
  const {default: data} = await import('./fixtures/assetFields.json')
  const sanityContentTypes = []
  for (const contentType of data.contentTypes || []) {
    sanityContentTypes.push(
      contentfulTypeToSanitySchema(contentType as ContentTypeProps, data as any, {
        keepMarkdown: true,
      }),
    )
  }
  context.schemas = sanityContentTypes
})

describe('Asset fields', async () => {
  test<LocalTestContext>('image field', async ({schemas}) => {
    const doc = schemas[0]
    const imageField = doc.fields.find((field) => field.name === 'image')
    expect(imageField).toBeDefined()
    expect(imageField?.type).toEqual('image')
  })

  test<LocalTestContext>('asset field', async ({schemas}) => {
    const doc = schemas[0]
    const assetField = doc.fields.find((field) => field.name === 'asset')
    expect(assetField).toBeDefined()
    expect(assetField?.type).toEqual('file')
  })

  test<LocalTestContext>('pdf field', async ({schemas}) => {
    const doc = schemas[0]
    const pdfField = doc.fields.find((field) => field.name === 'pdf')
    expect(pdfField).toBeDefined()
    expect(pdfField?.type).toEqual('file')
  })
})

describe('Asset download functionality', () => {
  const testExportDir = path.join(__dirname, 'test-export')

  beforeEach(async () => {
    // Очищаем тестовую директорию перед каждым тестом
    await fs.rm(testExportDir, {recursive: true, force: true})
    await fs.mkdir(testExportDir, {recursive: true})
  })

  afterEach(async () => {
    // Очищаем тестовую директорию после каждого теста
    await fs.rm(testExportDir, {recursive: true, force: true})
  })

  test('should pass downloadAssets=true to contentful-export', async () => {
    await exportAction({
      exportDir: testExportDir,
      spaceId: 'test-space',
      managementToken: 'test-token',
      accessToken: 'test-access-token',
      environmentId: 'master',
      saveFile: true,
      exportFile: 'export.json',
    })

    expect(contentfulExport).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadAssets: true,
      }),
    )
  })

  test('should create assets directory when downloadAssets=true', async () => {
    // Мокаем contentful-export с правильным типом возвращаемого значения
    vi.mocked(contentfulExport).mockImplementationOnce(async (options: ContentfulExportOptions) => {
      if (options.downloadAssets && options.exportDir) {
        await fs.mkdir(path.join(options.exportDir, 'assets'), {recursive: true})
      }
      return {
        tags: [],
        entries: [],
        contentTypes: [],
        assets: [],
        editorInterfaces: [],
        webhooks: [],
        roles: [],
        locales: [],
      }
    })

    await exportAction({
      exportDir: testExportDir,
      spaceId: 'test-space',
      managementToken: 'test-token',
      accessToken: 'test-access-token',
      environmentId: 'master',
      saveFile: true,
      exportFile: 'export.json',
    })

    // Проверяем, что директория assets создана
    const assetsDirExists = await fs
      .access(path.join(testExportDir, 'assets'))
      .then(() => true)
      .catch(() => false)
    expect(assetsDirExists).toBe(true)
  })
})

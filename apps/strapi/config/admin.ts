import type { UID } from "@strapi/strapi"

import type { StrapiPreviewConfig } from "../types/internals"

export default ({ env }) => {
  const strapiPreviewConfig: StrapiPreviewConfig = {
    enabled: env("STRAPI_PREVIEW_ENABLED") === "true",
    previewSecret: env("STRAPI_PREVIEW_SECRET"),
    clientUrl: env("CLIENT_URL"),
    enabledContentTypeUids: ["api::page.page"],
  }

  return {
    auth: {
      secret: env("ADMIN_JWT_SECRET"),
      // Strapi 5 session config. The legacy `auth.options.expiresIn` is
      // deprecated and will be removed in Strapi 6; configure session and
      // refresh-token lifespans explicitly here. Values are in seconds.
      sessions: {
        maxRefreshTokenLifespan: env.int(
          "ADMIN_SESSION_MAX_REFRESH_TOKEN_LIFESPAN",
          60 * 60 * 24 * 30 // 30 days
        ),
        maxSessionLifespan: env.int(
          "ADMIN_SESSION_MAX_SESSION_LIFESPAN",
          60 * 60 * 24 // 1 day
        ),
      },
    },
    apiToken: {
      salt: env("API_TOKEN_SALT"),
    },
    transfer: {
      token: {
        salt: env("TRANSFER_TOKEN_SALT"),
      },
    },
    // Used by Strapi 5 to encrypt sensitive admin data at rest.
    // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    secrets: {
      encryptionKey: env("ENCRYPTION_KEY"),
    },
    preview: {
      enabled: strapiPreviewConfig.enabled,
      config: {
        allowedOrigins: env("CLIENT_URL"),
        handler: async (
          uid: UID.CollectionType,
          { documentId, locale, status }
        ) => {
          // Fetch the complete document from Strapi
          if (
            !strapiPreviewConfig.enabledContentTypeUids.includes(uid) ||
            typeof strapiPreviewConfig.previewSecret !== "string" ||
            typeof strapiPreviewConfig.clientUrl !== "string"
          ) {
            return null
          }
          const document = await strapi
            .documents(uid)
            .findOne({ documentId, locale })
          const pathname = (document as { fullPath?: string })?.fullPath // not all collections have the fullPath attribute
          // Disable preview if the pathname is not found
          if (!pathname) {
            return null // returning null diables the preview button in the UI
          }
          // Use Next.js draft mode passing it a secret key and the content-type status
          const urlSearchParams = new URLSearchParams({
            url: pathname,
            locale,
            secret: strapiPreviewConfig.previewSecret,
            status,
          })

          return `${strapiPreviewConfig.clientUrl}/api/preview?${urlSearchParams}`
        },
      },
    },
    watchIgnoreFiles: ["**/config/sync/**"],
  }
}

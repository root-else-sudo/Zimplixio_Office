/** A business-rule violation (self-protection, invalid state). Maps to HTTP 409/400. */
export class AdminRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminRuleError'
  }
}

/** The target company/user/invite does not exist. Maps to HTTP 404. */
export class AdminNotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message)
    this.name = 'AdminNotFoundError'
  }
}

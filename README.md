# Cloudflare KV Swap

A command line tool for swapping Cloudflare KV namespaces with freshly created ones, useful for "clearing" test data.

Instead of removing key-value pairs, this tool **deletes** the KV namespace, creates a new one with the same name, and automatically updates existing bindings.

## License

MIT

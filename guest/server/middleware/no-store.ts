export default defineEventHandler(event => {
  // Published content and its availability can change at any time.
  setHeader(event, 'cache-control', 'no-store')
})

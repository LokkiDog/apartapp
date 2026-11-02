export type EnquiryApartment = { title: string, slug: string }
export function useApartmentEnquiry() {
  const current = useState<EnquiryApartment | null>('guest-contact-apartment', () => null)
  const target = useState<EnquiryApartment | null>('guest-enquiry-apartment', () => null)
  const open = useState('guest-apartment-enquiry-open', () => false)
  function request(apartment: EnquiryApartment) { target.value = { ...apartment }; open.value = true }
  return { current, target, open, request }
}

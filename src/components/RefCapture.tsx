import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { storeReferralCode } from '@/lib/referral';

/** Saves a ?ref=CODE from any page so a supplier who signs up later is still credited to the referrer. */
export default function RefCapture() {
  const { search } = useLocation();
  useEffect(() => {
    const ref = new URLSearchParams(search).get('ref');
    if (ref) storeReferralCode(ref);
  }, [search]);
  return null;
}

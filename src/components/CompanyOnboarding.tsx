import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useFirebase } from './FirebaseProvider';
import { CompanyType, UserRole } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, Users, Shield, ArrowRight, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { logActivity } from '../lib/audit';

export const CompanyOnboarding: React.FC = () => {
  const { user, profile } = useFirebase();
  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState<CompanyType>(CompanyType.TECH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Real-time status lookup
  const [checkingName, setCheckingName] = useState(false);
  const [isNewCompany, setIsNewCompany] = useState<boolean | null>(null);
  const [existingCasing, setExistingCasing] = useState('');

  useEffect(() => {
    if (!companyName.trim()) {
      setIsNewCompany(null);
      setExistingCasing('');
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingName(true);
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const matchedUser = usersSnap.docs.find(d => {
          const data = d.data();
          return data.companyName && data.companyName.trim().toLowerCase() === companyName.trim().toLowerCase();
        });

        if (matchedUser) {
          setIsNewCompany(false);
          setExistingCasing(matchedUser.data().companyName);
          // Set company type to match existing company for seamless joining
          if (matchedUser.data().companyType) {
            setCompanyType(matchedUser.data().companyType as CompanyType);
          }
        } else {
          setIsNewCompany(true);
          setExistingCasing('');
        }
      } catch (err) {
        console.error("Error verifying company status:", err);
      } finally {
        setCheckingName(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [companyName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !companyName.trim() || loading) return;

    const normalizedName = companyName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 50) {
      setError("Company Name must be between 2 and 50 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Re-fetch users snapshot to prevent race conditions during concurrent onboarding
      const usersSnap = await getDocs(collection(db, 'users'));
      const existingMatch = usersSnap.docs.find(d => {
        const data = d.data();
        return data.companyName && data.companyName.trim().toLowerCase() === normalizedName.toLowerCase();
      });

      const finalCompanyName = existingMatch ? existingMatch.data().companyName : normalizedName;
      const finalCompanyType = existingMatch ? (existingMatch.data().companyType || companyType) : companyType;
      
      // Determine role:
      // First user of this company gets ADMIN role. Bootstrap emails also always get ADMIN.
      const metaEnv = (import.meta as any).env || {};
      const adminEmailsStr = (metaEnv.VITE_ADMIN_EMAILS || 'tenantsitsolutions@gmail.com,jonathanigimoh@gmail.com').toLowerCase();
      const adminEmails = adminEmailsStr.split(',').map(email => email.trim());
      const isBootstrapAdmin = user.email && adminEmails.includes(user.email.toLowerCase());

      const isFirstForCompany = !existingMatch;
      const roleToSet = (isFirstForCompany || isBootstrapAdmin) ? UserRole.ADMIN : UserRole.MEMBER;

      // Update user document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        companyName: finalCompanyName,
        companyType: finalCompanyType,
        role: roleToSet
      });

      // If they are the first user for this organization, seed initial channels for them
      if (isFirstForCompany) {
        const defaultChannels = [
          { name: 'general', description: 'Company-wide general discussions' },
          { name: 'transfers', description: 'Fast secure file transfers' },
          { name: 'announcements', description: 'Official corporate bulletin board' }
        ];

        for (const ch of defaultChannels) {
          await addDoc(collection(db, 'channels'), {
            name: ch.name,
            description: ch.description,
            isPrivate: false,
            ownerId: user.uid,
            members: [user.uid],
            admins: [user.uid],
            mutedMembers: [],
            createdAt: Date.now(),
            companyName: finalCompanyName
          });
        }

        logActivity({
          type: 'system',
          action: 'Workspace Initialized',
          details: `Initialized default corporate workspace channels for ${finalCompanyName}`,
          severity: 'info'
        });
      }

      logActivity({
        type: 'auth',
        action: 'Company Enlisted',
        details: `User joined ${finalCompanyName} as a ${roleToSet.toUpperCase()}`,
        severity: 'info'
      });

    } catch (err: any) {
      console.error("Failed to complete onboarding:", err);
      setError(err?.message || "An unexpected error occurred during client enlistment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50/50 p-6 font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-xl bg-white border border-slate-100 rounded-3xl shadow-2xl relative overflow-hidden p-8 sm:p-10"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-workspace-accent" />

        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white mb-4 shadow-md">
            <Building2 className="w-6 h-6 text-teal-400 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">Setup Your Workspace</h2>
          <p className="text-sm text-slate-500 mt-2">
            Configure or join an organization to unlock high-speed real-time file sharing and message hubs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="companyName" className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">
              Company/Organization Name
            </label>
            <div className="relative">
              <input
                id="companyName"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter workspace or domain name (e.g., Acme Corp)"
                className="w-full px-4 py-3.5 bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-slate-900 rounded-2xl outline-none transition-all font-sans font-medium text-slate-800"
              />
              {checkingName && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {isNewCompany !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -5 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -5 }}
                className="overflow-hidden"
              >
                {isNewCompany ? (
                  <div className="flex items-start gap-3 p-4 bg-teal-50/50 rounded-2xl border border-teal-100 text-teal-800 text-xs font-medium">
                    <Sparkles className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-teal-900">✨ Create New Workspace Directory</p>
                      <p className="text-teal-600 mt-1">
                        &ldquo;{companyName.trim()}&rdquo; is currently available! As the first user, you will be set up as the <strong>Workspace Administrator</strong> with full workspace management and channel permissions.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 text-xs font-medium">
                    <CheckCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900">🏢 Found Existing Workspace Directory</p>
                      <p className="text-slate-500 mt-1 font-sans">
                        You will join &ldquo;{existingCasing}&rdquo; as a <strong>Directory Member</strong>. To get admin capabilities, an existing organization administrator will promote you via team settings.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Render company type only for new workspaces */}
          <AnimatePresence>
            {(isNewCompany === true || isNewCompany === null) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-2"
              >
                <label htmlFor="companyType" className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">
                  Company Type
                </label>
                <select
                  id="companyType"
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value as CompanyType)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl appearance-none outline-none transition-all cursor-pointer font-sans font-bold text-slate-800"
                >
                  <option value={CompanyType.TECH}>Technology & IT</option>
                  <option value={CompanyType.FINANCE}>Financial Services</option>
                  <option value={CompanyType.HEALTHCARE}>Healthcare & Medical</option>
                  <option value={CompanyType.OTHER}>Other & Creative Services</option>
                </select>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="flex items-center gap-2 text-rose-500 bg-rose-50 border border-rose-100 rounded-2xl p-4 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !companyName.trim() || checkingName}
            className="w-full flex items-center justify-between px-6 py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-bold transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            <span>{isNewCompany ? 'Create Workspace & Launch' : 'Join Office Workspace'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </motion.div>
    </div>
  );
};

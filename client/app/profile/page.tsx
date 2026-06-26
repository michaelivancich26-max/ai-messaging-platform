"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024; // 1.5 MB base64 limit

export default function ProfilePage() {
  const { data: session, status } = useSession({ required: true, onUnauthenticated() { router.push("/"); } });
  const router = useRouter();
  const userId: string = (session?.user as any)?.id ?? "";
  const username: string = (session?.user as any)?.username ?? "";

  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    fetch(`${SERVER}/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(data => {
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? null);
      })
      .catch(() => {});
  }, [status, userId]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      alert("Image too large — please choose one under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    try {
      await fetch(`${SERVER}/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, avatarUrl }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") return (
    <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-500">Loading…</div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-800 px-3 md:px-5">
          <button className="md:hidden rounded p-1.5 text-gray-400 hover:bg-gray-800"
            onClick={() => setMobileSidebarOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-100">Profile</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-lg px-4 py-10 space-y-8">

            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              <button onClick={() => fileRef.current?.click()}
                className="group relative h-24 w-24 rounded-full overflow-hidden ring-2 ring-gray-700 hover:ring-indigo-500 transition-all">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-800 text-2xl font-bold text-gray-400">
                    {username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-white">
                    <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <div className="text-center">
                <p className="font-semibold text-gray-100">{username}</p>
                {avatarUrl && (
                  <button onClick={() => setAvatarUrl(null)}
                    className="mt-1 text-xs text-gray-500 hover:text-red-400 transition-colors">
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Bio</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Tell people a bit about yourself…"
                className="w-full resize-none rounded-xl bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500 transition-colors"
              />
              <p className="text-right text-xs text-gray-600">{bio.length}/500</p>
            </div>

            {/* Save */}
            <button
              onClick={save}
              disabled={saving}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                saved
                  ? "bg-green-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              }`}>
              {saved ? "Saved!" : saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The OpenAI key is protected per Windows user with CryptProtectData (DPAPI).
// There is intentionally no plaintext persistence fallback on other platforms.
#[cfg(windows)]
pub fn protect(input: &[u8]) -> Result<Vec<u8>, String> { transform(input, true) }
#[cfg(windows)]
pub fn unprotect(input: &[u8]) -> Result<Vec<u8>, String> { transform(input, false) }

#[cfg(windows)]
fn transform(input: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use std::ffi::c_void;
    #[repr(C)] struct Blob { size: u32, data: *mut u8 }
    #[link(name="Crypt32")] extern "system" { fn CryptProtectData(input:*const Blob, description:*const u16, entropy:*const Blob, reserved:*mut c_void, prompt:*mut c_void, flags:u32, output:*mut Blob)->i32; fn CryptUnprotectData(input:*const Blob, description:*mut *mut u16, entropy:*const Blob, reserved:*mut c_void, prompt:*mut c_void, flags:u32, output:*mut Blob)->i32; }
    #[link(name="Kernel32")] extern "system" { fn LocalFree(memory:*mut c_void)->*mut c_void; }
    let in_blob=Blob{size:input.len() as u32,data:input.as_ptr() as *mut u8}; let mut out=Blob{size:0,data:std::ptr::null_mut()};
    let ok=unsafe { if encrypt { CryptProtectData(&in_blob,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),0,&mut out) } else { CryptUnprotectData(&in_blob,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),0,&mut out) } };
    if ok==0 { return Err("Windows не зміг зашифрувати або розшифрувати ключ через DPAPI.".into()); }
    let result=unsafe { std::slice::from_raw_parts(out.data,out.size as usize).to_vec() };
    unsafe { LocalFree(out.data as *mut c_void); } Ok(result)
}

#[cfg(not(windows))]
pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Захищене зберігання ключа доступне лише у Windows.".into()) }
#[cfg(not(windows))]
pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> { Err("Захищене зберігання ключа доступне лише у Windows.".into()) }

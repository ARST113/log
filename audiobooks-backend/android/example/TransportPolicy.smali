.class public final Lapp/lampac/slovo/example/TransportPolicy;
.super Ljava/lang/Object;

# OkHttp may follow a cross-protocol Location even without scheme candidates.
.method public static allowRedirect(Ljava/lang/String;Ljava/lang/String;)Z
    .locals 3
    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getScheme()Ljava/lang/String;
    move-result-object v1
    const-string v2, "http"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v1
    if-eqz v1, :allow
    invoke-virtual {v0}, Landroid/net/Uri;->getEncodedPath()Ljava/lang/String;
    move-result-object v0
    if-eqz v0, :allow
    const-string v1, "/access/"
    invoke-virtual {v0, v1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z
    move-result v0
    if-eqz v0, :allow
    invoke-static {p0}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getScheme()Ljava/lang/String;
    move-result-object v0
    const-string v1, "https"
    invoke-virtual {v1, v0}, Ljava/lang/String;->equalsIgnoreCase(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :allow
    const/4 v0, 0x0
    return v0
    :allow
    const/4 v0, 0x1
    return v0
.end method
